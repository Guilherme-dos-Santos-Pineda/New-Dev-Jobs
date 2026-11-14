import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    isAuthError, isQuotaError, isConcorrenciaError, paradaAte, ESPERA_SEM_CICLO_MS,
    endOfMonthMs, apifyPoolState, resetApifyPool, temFolgaDeCredito,
} from '../services/apifyPool.js';

// ---------- Execuções simultâneas demais NÃO é falta de crédito (13/11/2026) ----------
test('isConcorrenciaError: limite de memória/execuções simultâneas', () => {
    const msg = 'By launching this job you will exceed the memory limit of 8192MB for all your Actor runs and builds (currently used: 8192MB, requested: 1024MB).';
    assert.equal(isConcorrenciaError({ statusCode: 402, message: msg }), true);
    assert.equal(isConcorrenciaError({ message: 'You have exceeded the limit of concurrent actor jobs' }), true);
    assert.equal(isConcorrenciaError({ message: 'Monthly usage hard limit exceeded' }), false);
    assert.equal(isConcorrenciaError(null), false);
});
test('isQuotaError: recusa por execuções simultâneas não marca a conta como sem crédito, mesmo com 402', () => {
    const msg = 'By launching this job you will exceed the memory limit of 8192MB for all your Actor runs and builds (currently used: 8192MB, requested: 1024MB).';
    assert.equal(isQuotaError({ statusCode: 402, message: msg }), false);
    assert.equal(isQuotaError({ message: 'You have exceeded the limit of concurrent actor jobs' }), false);
});

// ---------- Conta sem crédito para até a renovação DELA, não até o dia 1º ----------
test('paradaAte: usa o fim do ciclo da conta', () => {
    const agora = Date.UTC(2026, 10, 14, 12);
    assert.equal(paradaAte('2026-12-03T00:00:00.000Z', agora), Date.UTC(2026, 11, 3));
});
test('paradaAte: sem ciclo, ciclo inválido ou já passado, tenta de novo em 6 horas', () => {
    const agora = Date.UTC(2026, 11, 1, 0);
    assert.equal(paradaAte(null, agora), agora + ESPERA_SEM_CICLO_MS);
    assert.equal(paradaAte('lixo', agora), agora + ESPERA_SEM_CICLO_MS);
    // O bug: no dia 1º a conta (que só renova no dia 3) ficava parada até 1º de janeiro.
    assert.equal(paradaAte('2026-11-30T00:00:00.000Z', agora), agora + ESPERA_SEM_CICLO_MS);
});

// ---------- Robô extra só gasta o que sobra do monitoramento ----------
test('temFolgaDeCredito: soma o que resta em cada conta', () => {
    const uso = { accounts: [{ remainingUsd: 0 }, { remainingUsd: 1.5 }, { remainingUsd: 1 }] };
    assert.equal(temFolgaDeCredito(uso, 2), true);
    assert.equal(temFolgaDeCredito(uso, 3), false);
});
test('temFolgaDeCredito: na dúvida, não gasta', () => {
    assert.equal(temFolgaDeCredito(null, 2), false);
    assert.equal(temFolgaDeCredito({ accounts: [] }, 2), false);
    assert.equal(temFolgaDeCredito({ accounts: [{ remainingUsd: 5 }, { remainingUsd: null }] }, 2), false);
});

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

test('isAuthError: chave trocada ou revogada (401) passa para a próxima conta', () => {
    assert.equal(isAuthError({ statusCode: 401 }), true);
    assert.equal(isAuthError({ message: 'User was not found or authentication token is not valid' }), true);
    assert.equal(isAuthError({ statusCode: 402 }), false);
    assert.equal(isAuthError({ statusCode: 500, message: 'Internal Server Error' }), false);
});
