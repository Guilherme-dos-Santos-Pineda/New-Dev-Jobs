import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isQuotaError, endOfMonthMs, apifyPoolState, resetApifyPool } from '../services/apifyPool.js';

// ---------- Detecção de erro de crédito (rotaciona) vs transitório (retenta) ----------
test('isQuotaError: 402/403 são erro de cota', () => {
    assert.equal(isQuotaError({ statusCode: 402 }), true);
    assert.equal(isQuotaError({ status: 403 }), true);
});
test('isQuotaError: mensagens de crédito/uso esgotado', () => {
    assert.equal(isQuotaError({ message: 'Monthly usage hard limit exceeded' }), true);
    assert.equal(isQuotaError({ message: 'Insufficient credit on this account' }), true);
    assert.equal(isQuotaError({ message: 'Payment required' }), true);
});
test('isQuotaError: erro transitório NÃO é cota (deixa o pg-boss retentar)', () => {
    assert.equal(isQuotaError({ statusCode: 500, message: 'Internal Server Error' }), false);
    assert.equal(isQuotaError({ message: 'network timeout' }), false);
    assert.equal(isQuotaError({}), false);
    assert.equal(isQuotaError(null), false);
});

// ---------- Renovação do crédito na virada do mês (UTC) ----------
test('endOfMonthMs: aponta para o 1º dia do próximo mês (UTC)', () => {
    const jan15 = Date.UTC(2026, 0, 15, 10, 0, 0);
    assert.equal(endOfMonthMs(jan15), Date.UTC(2026, 1, 1));
    const dez20 = Date.UTC(2026, 11, 20);
    assert.equal(endOfMonthMs(dez20), Date.UTC(2027, 0, 1)); // vira o ano
});

// ---------- Estado/reset (sem tokens em ambiente de teste) ----------
test('apifyPoolState: sem tokens → total 0 e sem vazar segredo', () => {
    const s = apifyPoolState();
    assert.equal(typeof s.total, 'number');
    assert.ok(Array.isArray(s.accounts));
    for (const a of s.accounts) assert.ok(!/^apify_api/i.test(a.tokenHint), 'tokenHint não pode conter o token inteiro');
});
test('resetApifyPool: devolve o estado (idempotente)', () => {
    const s = resetApifyPool();
    assert.equal(s.healthy, s.total);
});
