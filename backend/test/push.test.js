import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
    prefsCompletas, prefsParaGravar, vagasNovas, avisoVagas, avisoEnvio, avisoPlano, avisoIndicacao, inscricaoMorta, TIPOS,
} from '../services/pushLogic.js';

const AGORA = Date.parse('2026-11-23T15:00:00Z');
const DIA = 86400000;

test('preferências: tudo ligado por padrão, só tipos conhecidos e booleanos gravam', () => {
    assert.deepEqual(prefsCompletas(null), Object.fromEntries(TIPOS.map((t) => [t, true])));
    assert.equal(prefsCompletas({ vagas: false }).vagas, false);
    assert.equal(prefsCompletas({ vagas: false }).plano, true);
    assert.deepEqual(prefsParaGravar({ vagas: false, envio: 'nao', hack: true, plano: true }), { vagas: false, plano: true });
});

test('vagas novas: só as das últimas 24 h, e sem vaga não avisa', () => {
    const feed = [{ createdAt: new Date(AGORA - 3600000) }, { createdAt: new Date(AGORA - 2 * DIA) }, { createdAt: new Date(AGORA - DIA + 1000) }];
    assert.equal(vagasNovas(feed, AGORA), 2);
    assert.equal(avisoVagas(0), null);
    assert.match(avisoVagas(1).title, /^1 vaga nova/);
    assert.match(avisoVagas(12).title, /^12 vagas novas/);
    assert.equal(avisoVagas(3).url, '/app');
});

test('envio das 9h: só avisa se saiu alguma vaga', () => {
    assert.equal(avisoEnvio(0), null);
    assert.match(avisoEnvio(50).body, /50 vagas/);
});

test('plano acabando: avisa com 3 dias, 1 dia e no dia, nunca nos outros', () => {
    const em = (d) => new Date(AGORA + d * DIA - 1000);
    assert.match(avisoPlano(em(3), AGORA).title, /3 dias/);
    assert.match(avisoPlano(em(1), AGORA).title, /amanhã/);
    assert.equal(avisoPlano(em(2), AGORA), null);
    assert.equal(avisoPlano(em(10), AGORA), null);
    assert.equal(avisoPlano(null, AGORA), null);
    assert.equal(avisoPlano(em(1), AGORA).url, '/app/assinatura');
});

test('inscrição que o navegador apagou (404/410) sai da base; erro passageiro não', () => {
    assert.equal(inscricaoMorta(410), true);
    assert.equal(inscricaoMorta(404), true);
    assert.equal(inscricaoMorta(429), false);
    assert.equal(inscricaoMorta(500), false);
});

test('aviso nunca leva email de recrutador nem dado da vaga: só título, texto e uma tela do app', () => {
    for (const a of [avisoVagas(5), avisoEnvio(5), avisoPlano(new Date(AGORA + 3 * DIA - 1000), AGORA), avisoIndicacao()]) {
        assert.deepEqual(Object.keys(a).sort(), ['body', 'title', 'url']);
        assert.match(a.url, /^\/app/);
        assert.doesNotMatch(`${a.title} ${a.body}`, /@/);
    }
});

test('os avisos estão ligados nos lugares certos', () => {
    const ler = (f) => fs.readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.match(ler('../services/autoEnvio.js'), /avisar\(u\.Id, 'envio'/);
    assert.match(ler('../services/indicacao.js'), /avisar\(id, 'indicacao'/);
    assert.match(ler('../worker.js'), /tickNotificacoes\(\)/);
    assert.match(ler('../../frontend/public/sw.js'), /addEventListener\('push'/);
});
