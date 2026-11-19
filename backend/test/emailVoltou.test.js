import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { motivoParaRecusar, deveBloquear, todosBloqueados, AVISOS_POR_DIA } from '../services/emailVoltouLogic.js';
import { passesFilters } from '../services/jobsQuery.js';
import { variantesDoPerfil } from '../services/ampliarPerfilLogic.js';
import { areaForaDeTI } from '../services/classify.js';
import { AREAS_FORA_DE_TI } from '../config/areas.js';
import { ALLOWED_AREAS } from '../config/profileOptions.js';

const AGORA = Date.parse('2026-11-19T12:00:00Z');
const DIA = 86400000;

test('email voltou: só quem mandou pelo Gmail, nos últimos 30 dias, até 5 por dia', () => {
    const app = { Status: 'sent', SentAt: new Date(AGORA - 2 * DIA) };
    assert.equal(motivoParaRecusar({ app, avisosHoje: 0 }, AGORA), null);
    assert.match(motivoParaRecusar({ app: null, avisosHoje: 0 }, AGORA), /não encontrada/);
    assert.match(motivoParaRecusar({ app: { ...app, Status: 'manual' }, avisosHoje: 0 }, AGORA), /Gmail/, '"enviar você mesmo" não conta');
    assert.match(motivoParaRecusar({ app: { ...app, Status: 'failed' }, avisosHoje: 0 }, AGORA), /Gmail/);
    assert.match(motivoParaRecusar({ app: { ...app, SentAt: new Date(AGORA - 40 * DIA) }, avisosHoje: 0 }, AGORA), /30 dias/);
    assert.match(motivoParaRecusar({ app, avisosHoje: AVISOS_POR_DIA }, AGORA), /amanhã/);
});

test('email voltou: bloqueia com 2 pessoas diferentes ou com o admin', () => {
    assert.equal(deveBloquear([{ userId: 'a', googleEmail: 'a@gmail.com' }]), false, 'uma pessoa só não basta');
    assert.equal(deveBloquear([{ userId: 'a', googleEmail: 'a@gmail.com' }, { userId: 'b', googleEmail: 'b@gmail.com' }]), true);
    assert.equal(deveBloquear([{ userId: 'a', googleEmail: 'x@gmail.com' }, { userId: 'b', googleEmail: 'X@gmail.com' }]), false, 'duas contas com o mesmo Gmail são uma pessoa');
    assert.equal(deveBloquear([{ userId: 'a', admin: true }]), true);
});

test('email voltou: a vaga só some quando TODOS os endereços voltaram', () => {
    const b = new Set(['rh@x.com']);
    assert.equal(todosBloqueados(['rh@x.com'], b), true);
    assert.equal(todosBloqueados(['rh@x.com', 'vagas@x.com'], b), false);
    assert.equal(todosBloqueados([], b), false);
});

test('a lista de bloqueados entra no feed e no envio', () => {
    const ler = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(ler('../services/jobsQuery.js'), /vagasComEmailBloqueado\(vagas\)/);
    assert.match(ler('../services/sender.js'), /emailsBloqueados\(\)/);
});

const vaga = (extra = {}) => ({
    Id: '1', JobTitle: 'Desenvolvedor Backend Pleno', Company: 'Acme', Description: 'Vaga de backend com Node.',
    Email: 'rh@acme.com.br', Skills: [], CreatedAt: new Date(), Area: 'backend', Level: 'pleno', Mods: null, IsBR: true, ...extra,
});

test('só vagas que dizem a modalidade: tira a que não diz, só com a opção ligada', () => {
    const perfil = { Region: 'br', Modalities: ['remoto'] };
    assert.equal(passesFilters(vaga(), perfil), true, 'sem a opção, a que não diz passa');
    assert.equal(passesFilters(vaga(), { ...perfil, StrictModality: true }), false);
    assert.equal(passesFilters(vaga({ Description: 'Vaga 100% remota de backend com Node.' }), { ...perfil, StrictModality: true }), true);
    assert.equal(passesFilters(vaga(), { Region: 'br', Modalities: [], StrictModality: true }), true, 'sem modalidade marcada, nada muda');
});

test('perfil com pouca vaga: sugere aceitar a vaga que não diz a modalidade', () => {
    const ids = variantesDoPerfil({ Modalities: ['remoto'], StrictModality: true }).map((v) => v.id);
    assert.ok(ids.includes('semModalidade'));
    assert.ok(!variantesDoPerfil({ Modalities: ['remoto'] }).some((v) => v.id === 'semModalidade'));
});

test('compras e suprimentos é área própria, opt-in e aceita pelo perfil', () => {
    assert.ok(AREAS_FORA_DE_TI.includes('compras'));
    assert.ok(ALLOWED_AREAS.includes('compras'));
    const titulo = (JobTitle) => areaForaDeTI({ ...vaga(), JobTitle, Area: 'nontech', Description: 'Vaga em São Paulo/SP' });
    assert.equal(titulo('Analista de Compras'), 'compras');
    assert.equal(titulo('Comprador de Materiais Indiretos'), 'compras');
    assert.equal(titulo('Assistente de Logística'), 'operacoes');
    // Quem não marcou compras não recebe.
    assert.equal(passesFilters({ ...vaga(), JobTitle: 'Analista de Compras', Area: 'nontech', Level: null }, { Region: 'br', Areas: ['backend'] }), false);
});
