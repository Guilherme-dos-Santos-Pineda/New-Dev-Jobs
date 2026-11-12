import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diasEntreEnvios, DIAS_MESMO_RECRUTADOR, DIAS_MESMO_RECRUTADOR_PAGO } from '../services/mesmoRecrutador.js';

test('mesmo recrutador: 15 dias no plano pago, 30 no grátis e no plano vencido', () => {
    const agora = Date.UTC(2026, 10, 12);
    assert.equal(DIAS_MESMO_RECRUTADOR_PAGO, 15);
    assert.equal(diasEntreEnvios('starter', new Date(agora + 86400000), agora), 15);
    assert.equal(diasEntreEnvios('pro', null, agora), 15);
    assert.equal(diasEntreEnvios('free', null, agora), DIAS_MESMO_RECRUTADOR);
    assert.equal(diasEntreEnvios('starter', new Date(agora - 86400000), agora), 30, 'plano vencido volta aos 30');
});
