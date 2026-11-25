import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailDescartavel, podeVerVaga, criarContador } from '../services/segurancaLogic.js';

test('email descartável: domínio e subdomínio; Gmail e domínio próprio passam', () => {
    assert.equal(emailDescartavel('x@mailinator.com'), true);
    assert.equal(emailDescartavel('x@foo.mailinator.com'), true);
    assert.equal(emailDescartavel('X@YopMail.com'), true);
    assert.equal(emailDescartavel('dev@gmail.com'), false);
    assert.equal(emailDescartavel('dev@empresa.com.br'), false);
    assert.equal(emailDescartavel(''), false);
});

test('detalhe da vaga: só do feed, das enviadas ou dos destaques (caso real: percorrer a base pelo número)', () => {
    const ctx = { noFeed: ['10', 11n], enviadas: [20], destaques: ['30'] };
    assert.equal(podeVerVaga('10', ctx), true);
    assert.equal(podeVerVaga(11, ctx), true);
    assert.equal(podeVerVaga('20', ctx), true);
    assert.equal(podeVerVaga(30, ctx), true);
    assert.equal(podeVerVaga('12345', ctx), false);
    assert.equal(podeVerVaga('1', { }), false);
});

test('contador: passa do teto uma vez só (alerta) e zera no outro dia', () => {
    const contar = criarContador(2);
    const d1 = new Date('2026-11-25T10:00:00Z');
    assert.deepEqual(contar('a', d1), { n: 1, passou: false, primeiraVez: false });
    contar('a', d1);
    assert.deepEqual(contar('a', d1), { n: 3, passou: true, primeiraVez: true });
    assert.equal(contar('a', d1).primeiraVez, false);
    assert.equal(contar('b', d1).passou, false);
    assert.equal(contar('a', new Date('2026-11-26T00:01:00Z')).n, 1);
});
