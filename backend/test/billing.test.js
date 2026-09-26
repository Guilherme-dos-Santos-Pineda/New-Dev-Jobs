import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    checkoutModeForPrice, normalizeChargeStatus, computeExpiry, isPlanExpired,
    planForPriceId, mapCharge, decideCheckoutSession, PLAN_DAYS, decideConcessaoDePlano } from '../services/billingLogic.js';
import { planOf, PLANS } from '../config/plans.js';

const DAY = 86400000;

// ---------- Modo do checkout (recorrente vs pagamento único) ----------
test('checkoutModeForPrice: preço recorrente → assinatura', () => {
    assert.equal(checkoutModeForPrice({ recurring: { interval: 'month' } }), 'subscription');
});
test('checkoutModeForPrice: preço único → pagamento avulso', () => {
    assert.equal(checkoutModeForPrice({ recurring: null, type: 'one_time' }), 'payment');
    assert.equal(checkoutModeForPrice({}), 'payment');
    assert.equal(checkoutModeForPrice(null), 'payment');
});

// ---------- Normalização de status do charge ----------
test('normalizeChargeStatus: mapeia os status do Stripe p/ a UI', () => {
    assert.equal(normalizeChargeStatus('succeeded'), 'paid');
    assert.equal(normalizeChargeStatus('pending'), 'pending');
    assert.equal(normalizeChargeStatus('failed'), 'failed');
    assert.equal(normalizeChargeStatus('estranho'), 'estranho'); // passa direto
    assert.equal(normalizeChargeStatus(undefined), 'unknown');
});

// ---------- Validade do plano (pagamento único, com empilhamento) ----------
test('computeExpiry: sem validade anterior conta a partir de agora', () => {
    const now = 1_000_000_000_000;
    assert.equal(computeExpiry(null, 30, now), now + 30 * DAY);
    assert.equal(computeExpiry(undefined, PLAN_DAYS, now), now + PLAN_DAYS * DAY);
});
test('computeExpiry: plano ainda ativo EMPILHA sobre o tempo restante', () => {
    const now = 1_000_000_000_000;
    const futuro = now + 10 * DAY; // 10 dias restantes
    assert.equal(computeExpiry(futuro, 30, now), futuro + 30 * DAY); // 40 dias no total
});
test('computeExpiry: validade expirada NÃO empilha (conta de agora)', () => {
    const now = 1_000_000_000_000;
    const passado = now - 5 * DAY;
    assert.equal(computeExpiry(passado, 30, now), now + 30 * DAY);
});
test('computeExpiry: respeita dias customizados', () => {
    const now = 1_000_000_000_000;
    assert.equal(computeExpiry(null, 7, now), now + 7 * DAY);
});

// ---------- Expiração ----------
test('isPlanExpired: passado expira, futuro não, null nunca', () => {
    const now = 1_000_000_000_000;
    assert.equal(isPlanExpired(now - 1, now), true);
    assert.equal(isPlanExpired(now + 1, now), false);
    assert.equal(isPlanExpired(null, now), false);
    assert.equal(isPlanExpired(undefined, now), false);
});

// ---------- price_id → plano ----------
test('planForPriceId: resolve pelo mapa de preços', () => {
    const prices = { starter: 'price_S', pro: 'price_P' };
    assert.equal(planForPriceId('price_S', prices), 'starter');
    assert.equal(planForPriceId('price_P', prices), 'pro');
    assert.equal(planForPriceId('price_X', prices), null);
    assert.equal(planForPriceId(null, prices), null);
    assert.equal(planForPriceId('price_S', {}), null);
});

// ---------- Mapeamento de charge p/ o histórico ----------
test('mapCharge: monta a linha do histórico com método e plano reais', () => {
    const row = mapCharge({
        id: 'ch_1', amount: 8000, currency: 'brl', status: 'succeeded', created: 1700000000,
        receipt_url: 'https://r', payment_method_details: { type: 'card' },
        payment_intent: { metadata: { plan: 'starter' } },
    });
    assert.equal(row.id, 'ch_1');
    assert.equal(row.amount, 8000);
    assert.equal(row.status, 'paid');
    assert.equal(row.date, 1700000000 * 1000);
    assert.equal(row.url, 'https://r');
    assert.equal(row.provider, 'stripe');
    assert.equal(row.method, 'card');
    assert.equal(row.plan, 'starter');
});
test('mapCharge: método cai p/ "card" e plano p/ null quando ausentes', () => {
    const row = mapCharge({ id: 'ch_2', amount: 0, status: 'pending', created: 0 });
    assert.equal(row.method, 'card');
    assert.equal(row.plan, null);
    assert.equal(row.status, 'pending');
    assert.equal(row.url, null);
});
test('mapCharge: pega o plano do metadata do charge se não vier do payment_intent', () => {
    const row = mapCharge({ id: 'ch_3', status: 'succeeded', created: 1, metadata: { plan: 'pro' } });
    assert.equal(row.plan, 'pro');
});

// ---------- Decisão do webhook (pago / não pago / erro / assinatura) ----------
test('decideCheckoutSession: pagamento único aprovado → grant de 30 dias', () => {
    const d = decideCheckoutSession({
        mode: 'payment', payment_status: 'paid',
        client_reference_id: 'u1', metadata: { plan: 'starter' },
    });
    assert.deepEqual(d, { action: 'grant', userId: 'u1', plan: 'starter', days: PLAN_DAYS });
});
test('decideCheckoutSession: pagamento NÃO pago → ignore (não libera)', () => {
    const d = decideCheckoutSession({ mode: 'payment', payment_status: 'unpaid', client_reference_id: 'u1', metadata: { plan: 'pro' } });
    assert.equal(d.action, 'ignore');
});
test('decideCheckoutSession: pago mas sem plano/usuário → ignore (dados faltando)', () => {
    assert.equal(decideCheckoutSession({ mode: 'payment', payment_status: 'paid', metadata: {} }).action, 'ignore');
    assert.equal(decideCheckoutSession({ mode: 'payment', payment_status: 'paid', client_reference_id: 'u1' }).action, 'ignore');
});
test('decideCheckoutSession: usa metadata.userId quando não há client_reference_id', () => {
    const d = decideCheckoutSession({ mode: 'payment', payment_status: 'paid', metadata: { userId: 'u9', plan: 'pro' } });
    assert.equal(d.userId, 'u9');
});
test('decideCheckoutSession: modo assinatura (legado) → subscribe', () => {
    const d = decideCheckoutSession({ mode: 'subscription', client_reference_id: 'u1', metadata: { plan: 'starter' } });
    assert.equal(d.action, 'subscribe');
    assert.equal(d.plan, 'starter');
});

// ---------- Catálogo de planos ----------
test('planOf: retorna o plano certo e cai no free p/ desconhecido', () => {
    assert.equal(planOf('starter').dailyLimit, PLANS.starter.dailyLimit);
    assert.equal(planOf('pro').label, 'Pro');
    assert.equal(planOf('inexistente').label, 'Free');
    assert.equal(planOf(undefined).label, 'Free');
});
test('planOf: apenas planos pagos permitem envio manual', () => {
    assert.equal(planOf('free').allowManual, false);
    assert.equal(planOf('starter').allowManual, true);
    assert.equal(planOf('pro').allowManual, true);
});

// =========================
// Concessão manual de plano (admin)
// =========================
// Dar plano de cortesia a alguém. O risco aqui não é cobrar errado, é dar
// permissão junto sem querer: plano e Role são colunas diferentes e precisam
// continuar assim.

test('concessão aceita plano da lista e devolve validade futura', () => {
    const agora = Date.UTC(2026, 0, 1);
    const r = decideConcessaoDePlano({ plano: 'pro', dias: 30, planosValidos: ['free', 'starter', 'pro'], nowMs: agora });
    assert.equal(r.ok, true);
    assert.equal(r.plano, 'pro');
    assert.equal(r.expiraEm, agora + 30 * 24 * 60 * 60 * 1000);
});

test('concessão NUNCA devolve Role, para plano nao virar permissao', () => {
    const r = decideConcessaoDePlano({ plano: 'pro', dias: 365, planosValidos: ['free', 'starter', 'pro'] });
    assert.equal(r.ok, true);
    assert.equal('Role' in r, false);
    assert.equal('role' in r, false);
    assert.equal('isAdmin' in r, false);
});

test('concessão recusa plano fora da lista', () => {
    const r = decideConcessaoDePlano({ plano: 'admin', dias: 30, planosValidos: ['free', 'starter', 'pro'] });
    assert.equal(r.ok, false);
    assert.match(r.erro, /desconhecido/i);
});

test('voltar para free zera a validade', () => {
    const r = decideConcessaoDePlano({ plano: 'free', dias: 30, planosValidos: ['free', 'starter', 'pro'] });
    assert.equal(r.ok, true);
    assert.equal(r.expiraEm, null);
});

test('concessão empilha sobre o tempo que ainda resta', () => {
    const agora = Date.UTC(2026, 0, 1);
    const restam10 = agora + 10 * 24 * 60 * 60 * 1000;
    const r = decideConcessaoDePlano({ plano: 'pro', dias: 30, planosValidos: ['free', 'starter', 'pro'], atualMs: restam10, nowMs: agora });
    assert.equal(r.expiraEm, restam10 + 30 * 24 * 60 * 60 * 1000);
});

test('concessão recusa dias invalidos', () => {
    const validos = ['free', 'starter', 'pro'];
    for (const dias of [0, -5, 1.5, NaN, 99999, '30x']) {
        assert.equal(decideConcessaoDePlano({ plano: 'pro', dias, planosValidos: validos }).ok, false, `deveria recusar ${dias}`);
    }
});
