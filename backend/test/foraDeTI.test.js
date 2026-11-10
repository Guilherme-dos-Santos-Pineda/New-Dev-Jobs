import { test } from 'node:test';
import assert from 'node:assert/strict';
import { areaForaDeTI, detectArea, REMOVIDA_PELO_ADMIN } from '../services/classify.js';
import { passesFilters, candidatasDoPerfil, shapeJob } from '../services/jobsQuery.js';
import { computeMatch } from '../services/matching.js';
import { expandirAreas, AREAS_FORA_DE_TI } from '../config/areas.js';
import { ALLOWED_AREAS } from '../config/profileOptions.js';

// Teste aberto em 03/11/2026: as vagas de fora de TI que o robô já traz deixam de
// ir para o lixo, mas SÓ para quem marca a área. O risco a travar aqui é o
// inverso: vaga de recepcionista chegar no feed de um dev.

const vaga = (JobTitle, extra = {}) => ({
    Id: '1', JobTitle, Company: 'Acme', Description: 'Vaga em São Paulo/SP', Email: 'rh@acme.com.br',
    Skills: [], CreatedAt: new Date(), Area: 'nontech', Level: null, Mods: null, IsBR: true, ...extra,
});

test('areaForaDeTI: separa pelo título', () => {
    assert.equal(areaForaDeTI(vaga('Assistente Administrativo')), 'adm');
    assert.equal(areaForaDeTI(vaga('Analista Fiscal')), 'adm');
    assert.equal(areaForaDeTI(vaga('Analista de RH')), 'adm');
    assert.equal(areaForaDeTI(vaga('Vendedor(a)')), 'vendas');
    assert.equal(areaForaDeTI(vaga('Analista de Customer Success')), 'vendas');
    assert.equal(areaForaDeTI(vaga('Social Media')), 'marketing');
    assert.equal(areaForaDeTI(vaga('Analista de Marketing')), 'marketing');
    assert.equal(areaForaDeTI(vaga('Assistente de Logística')), 'operacoes');
    assert.equal(areaForaDeTI(vaga('Comprador(a)')), 'operacoes');
});

test('areaForaDeTI: outra profissão, vaga de TI e título vago ficam de fora', () => {
    assert.equal(areaForaDeTI(vaga('Enfermeira de Atendimento')), null);
    assert.equal(areaForaDeTI(vaga('Técnico de Manutenção')), null);
    assert.equal(areaForaDeTI(vaga('Communications Manager')), 'marketing');
    assert.equal(areaForaDeTI(vaga('Advogado')), 'juridico');
    assert.equal(areaForaDeTI(vaga('Assistente Jurídico')), 'juridico');
    assert.equal(areaForaDeTI(vaga('Estagiário de Direito')), 'juridico');
    assert.equal(areaForaDeTI(vaga('Advogado Trabalhista Comercial')), 'juridico');
    assert.equal(areaForaDeTI(vaga('Desenvolvedor Back-end')), null);
    assert.equal(areaForaDeTI(vaga('Vaga')), null);
});

test('areaForaDeTI: vaga encerrada e removida pelo admin não voltam', () => {
    assert.equal(areaForaDeTI(vaga('Analista Fiscal', { Description: 'Processo seletivo encerrado' })), null);
    assert.equal(areaForaDeTI(vaga('Analista Fiscal', { AiClassification: REMOVIDA_PELO_ADMIN })), null);
});

test('o Area gravado continua nontech: destaques, admin e robôs não mudam', () => {
    assert.equal(detectArea(vaga('Assistente Administrativo')), 'nontech');
});

test('quem não marcou NÃO recebe: dev, perfil sem área e sem perfil', () => {
    const adm = vaga('Assistente Administrativo');
    for (const perfil of [{ Region: 'br', Areas: ['backend'] }, { Region: 'br', Areas: ['dev'] }, { Region: 'br', Areas: [] }, { Region: 'br' }, null]) {
        assert.equal(passesFilters(adm, perfil), false);
        assert.equal(candidatasDoPerfil([adm], perfil).length, 0);
    }
});

test('quem marcou recebe só a área marcada', () => {
    const p = { Region: 'br', Areas: ['adm'] };
    assert.equal(candidatasDoPerfil([vaga('Assistente Administrativo')], p).length, 1);
    assert.equal(candidatasDoPerfil([vaga('Vendedor')], p).length, 0);
    assert.equal(candidatasDoPerfil([vaga('Enfermeira')], p).length, 0);
    const dev = vaga('Desenvolvedor Back-end', { Area: 'backend' });
    assert.equal(candidatasDoPerfil([dev], p).length, 0, 'marcar adm não traz vaga de dev');
});

test('dá para marcar TI e fora de TI juntos', () => {
    const p = { Region: 'br', Areas: ['backend', 'vendas'] };
    const vagas = [vaga('Vendedor'), vaga('Desenvolvedor Back-end', { Area: 'backend' }), vaga('Analista Fiscal')];
    assert.deepEqual(candidatasDoPerfil(vagas, p).map((j) => j.JobTitle), ['Vendedor', 'Desenvolvedor Back-end']);
});

test('computeMatch: área marcada passa do corte de 50% mesmo sem skill de tecnologia', () => {
    const r = computeMatch({ Skills: [], Areas: ['adm'] }, vaga('Assistente Administrativo', { Skills: ['Excel', 'SAP'] }));
    assert.equal(r.areaMismatch, false);
    assert.equal(r.area, 'adm');
    assert.ok(r.score >= 50, `veio ${r.score}`);
});

test('computeMatch: vaga fora de TI continua punida para quem não marcou', () => {
    const r = computeMatch({ Skills: ['Excel'], Areas: ['backend'] }, vaga('Assistente Administrativo', { Skills: ['Excel'] }));
    assert.equal(r.areaMismatch, true);
    assert.ok(r.score <= 30);
});

test('computeMatch: o teto de nível vale também fora de TI', () => {
    const r = computeMatch({ Skills: [], Areas: ['adm'], Levels: ['estagio'] }, vaga('Gerente Financeiro', { Level: 'manager' }));
    assert.ok(r.score < 50, `veio ${r.score}`);
});

test('shapeJob: a tela recebe a área de verdade, não nontech', () => {
    const p = { Areas: ['vendas'] };
    assert.equal(shapeJob(vaga('Vendedor'), p, new Set()).area, 'vendas');
});

test('as áreas de fora de TI podem ser salvas e não puxam nenhuma outra', () => {
    for (const a of AREAS_FORA_DE_TI) {
        assert.ok(ALLOWED_AREAS.includes(a), `${a} seria descartada no PUT /profile`);
        assert.deepEqual(expandirAreas([a]), [a]);
    }
});
