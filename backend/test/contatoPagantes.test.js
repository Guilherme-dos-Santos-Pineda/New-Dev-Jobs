import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grupoDoPagante, mensagemPara, whatsDe, notaDoPagante } from '../services/contatoPagantesLogic.js';

const base = { nome: 'Gustavo Ribas', gmail: true, auto: true, autoRodouHoje: true, hoje: 50, limite: 50, envios: 300 };

test('grupo: sem Gmail ou Automático desligado é "não usa"', () => {
    assert.equal(grupoDoPagante({ ...base, gmail: false }), 'naoUsa');
    assert.equal(grupoDoPagante({ ...base, auto: false }), 'naoUsa');
});

test('grupo: lote de hoje abaixo da metade do limite é "sem vaga"; antes de rodar, não', () => {
    assert.equal(grupoDoPagante({ ...base, hoje: 3 }), 'semVaga');
    assert.equal(grupoDoPagante({ ...base, hoje: 25 }), 'usa');
    assert.equal(grupoDoPagante({ ...base, hoje: 0, autoRodouHoje: false }), 'usa');
});

test('mensagem: chama pelo primeiro nome, sem travessão, e usa a dica quando houver', () => {
    const m = mensagemPara({ ...base, hoje: 2 }, { dica: { texto: 'Incluir vagas mais antigas', ganho: 398 } });
    assert.match(m, /^Fala Gustavo,/);
    assert.match(m, /Incluir vagas mais antigas/);
    assert.match(m, /398/);
    for (const p of [{ ...base, gmail: false }, { ...base, auto: false }, { ...base, auto: false, envios: 420 }, base]) {
        assert.doesNotMatch(mensagemPara(p, { venceEm: '23/01/2027' }), /—/);
        assert.ok(notaDoPagante(p));
    }
});

test('whatsDe: põe o 55 e recusa número curto', () => {
    assert.equal(whatsDe('(11) 98078-6752'), '5511980786752');
    assert.equal(whatsDe('+55 11 98078-6752'), '5511980786752');
    assert.equal(whatsDe('1234'), null);
    assert.equal(whatsDe(''), null);
});
