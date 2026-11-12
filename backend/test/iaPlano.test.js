import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoIa, validadeDaCompra, itemDoCheckoutIa, IA_USOS, IA_PRECO } from '../services/iaLogic.js';
import { decideCheckoutSession } from '../services/billingLogic.js';

const agora = Date.UTC(2026, 10, 12, 12);
const h = (n) => new Date(agora + n * 3600_000);

test('quem nunca usou: o teste começa no primeiro uso, sem envio com IA ainda', () => {
    const e = estadoIa({ agora });
    assert.equal(e.modo, 'novo');
    assert.equal(e.podeAnalisar, true);
    assert.equal(e.podeVersao, true);
    assert.equal(e.nosEnvios, false);
});

test('teste de 48 h: 1 análise e 1 versão, e a versão vai nos envios enquanto durar', () => {
    const e = estadoIa({ agora, testeDesde: h(-10), usosTeste: { analise: 1, versao: 0 } });
    assert.equal(e.modo, 'teste');
    assert.equal(e.podeAnalisar, false);
    assert.equal(e.podeVersao, true);
    assert.equal(e.nosEnvios, true);
    assert.equal(e.ate, h(38).getTime());
});

test('depois das 48 h acabou: nada de IA e nada de versão nos envios', () => {
    const e = estadoIa({ agora, testeDesde: h(-49), usosTeste: { analise: 0, versao: 0 } });
    assert.equal(e.modo, 'fim');
    assert.equal(e.podeAnalisar, false);
    assert.equal(e.podeVersao, false);
    assert.equal(e.nosEnvios, false);
});

test('plano de IA: 10 usos somando análises e versões, extras do admin somam', () => {
    assert.equal(estadoIa({ agora, iaAte: h(24 * 20), usosPlano: 3 }).restantes, 7);
    const cheio = estadoIa({ agora, iaAte: h(24 * 20), usosPlano: IA_USOS });
    assert.equal(cheio.podeAnalisar, false);
    assert.equal(cheio.podeVersao, false);
    assert.equal(cheio.nosEnvios, true, 'acabar os usos não tira a versão já aprovada dos envios');
    assert.equal(estadoIa({ agora, iaAte: h(1), usosPlano: IA_USOS, extras: 2 }).restantes, 2);
});

test('plano vencido cai no teste ou no fim, nunca fica liberado', () => {
    assert.equal(estadoIa({ agora, iaAte: h(-1), testeDesde: h(-100) }).modo, 'fim');
    assert.equal(estadoIa({ agora, iaAte: h(-1) }).modo, 'novo');
});

test('admin não tem limite', () => {
    assert.equal(estadoIa({ agora, admin: true, testeDesde: h(-100) }).podeVersao, true);
});

test('comprar de novo empilha os dias e recomeça os 10 usos', () => {
    const r = validadeDaCompra(h(24 * 5), agora);
    assert.equal(r.iaAte, h(24 * 35).getTime());
    assert.equal(r.iaDesde, agora);
    assert.equal(validadeDaCompra(null, agora).iaAte, h(24 * 30).getTime());
    assert.equal(validadeDaCompra(h(-5), agora).iaAte, h(24 * 30).getTime());
});

test('checkout do plano de IA cobra R$ 5', () => {
    assert.equal(IA_PRECO, 5);
    assert.equal(itemDoCheckoutIa().price_data.unit_amount, 500);
    assert.equal(itemDoCheckoutIa().price_data.currency, 'brl');
});

test('webhook: a compra da IA nunca vira troca de plano (não pode tirar o Automático)', () => {
    const pago = { mode: 'payment', payment_status: 'paid', client_reference_id: 'u1', id: 'cs_1', metadata: { userId: 'u1', addon: 'ia' } };
    assert.deepEqual(decideCheckoutSession(pago), { action: 'grantIa', userId: 'u1', sessionId: 'cs_1' });
    assert.equal(decideCheckoutSession({ ...pago, payment_status: 'unpaid' }).action, 'ignore');
    // Mesmo com um "plan" no metadata, o addon decide.
    assert.equal(decideCheckoutSession({ ...pago, metadata: { ...pago.metadata, plan: 'starter' } }).action, 'grantIa');
    // E a compra do Automático continua igual.
    assert.equal(decideCheckoutSession({ mode: 'payment', payment_status: 'paid', client_reference_id: 'u1', metadata: { plan: 'starter' } }).action, 'grant');
});
