// =========================================================================
// Lógica PURA de billing (pagamento único · 30 dias). Sem Stripe/SQL aqui —
// tudo determinístico e testável. billing.js/worker.js orquestram I/O em cima
// destas funções, que são o "cérebro" das decisões de cobrança.
// =========================================================================

export const PLAN_DAYS = 30;
const DAY_MS = 86400000;

// Modo do Stripe Checkout a partir do objeto de preço: recorrente → assinatura;
// caso contrário (one_time) → pagamento avulso.
export function checkoutModeForPrice(price) {
    return price && price.recurring ? 'subscription' : 'payment';
}

// Normaliza o status de um charge do Stripe para os status que a UI entende.
const CHARGE_STATUS = { succeeded: 'paid', pending: 'pending', failed: 'failed' };
export function normalizeChargeStatus(status) {
    return CHARGE_STATUS[status] || status || 'unknown';
}

// Nova validade do plano no pagamento único. Empilha sobre o tempo restante se o
// plano ainda estiver ativo (não perde dias ao renovar); se expirado/ausente,
// conta a partir de agora.
export function computeExpiry(currentMs, days = PLAN_DAYS, nowMs = Date.now()) {
    const base = currentMs && currentMs > nowMs ? currentMs : nowMs;
    return base + days * DAY_MS;
}

// O plano expirou? (null/undefined = sem validade = não expira por aqui)
export function isPlanExpired(expiresAtMs, nowMs = Date.now()) {
    return expiresAtMs != null && expiresAtMs < nowMs;
}

// price_id → plano (recebe o mapa de prices para ser puro/testável).
export function planForPriceId(priceId, prices = {}) {
    if (!priceId) return null;
    if (priceId === prices.starter) return 'starter';
    if (priceId === prices.pro) return 'pro';
    return null;
}

// Mapeia um charge do Stripe para a linha do histórico de pagamentos.
export function mapCharge(c = {}) {
    return {
        id: c.id,
        amount: c.amount,
        currency: c.currency,
        status: normalizeChargeStatus(c.status),
        date: (c.created || 0) * 1000,
        url: c.receipt_url || null,
        pdf: null,
        provider: 'stripe',
        method: c.payment_method_details?.type || 'card',
        plan: c.payment_intent?.metadata?.plan || c.metadata?.plan || null,
    };
}

// Decide o efeito de um evento checkout.session.completed.
//   { action: 'grant' }     → pagamento único aprovado: concede `days` de acesso.
//   { action: 'subscribe' } → assinatura (legado): aplica plano da subscription.
//   { action: 'ignore' }    → pagamento não concluído / dados faltando.
export function decideCheckoutSession(session = {}) {
    const userId = session.client_reference_id || session.metadata?.userId || null;
    const plan = session.metadata?.plan || null;
    if (session.mode === 'payment') {
        if (session.payment_status === 'paid' && userId && plan) {
            return { action: 'grant', userId, plan, days: PLAN_DAYS };
        }
        return { action: 'ignore', userId, plan };
    }
    return { action: 'subscribe', userId, plan };
}


// =========================
// Concessão manual de plano (admin)
// =========================
// Serve para dar plano a alguém sem cobrança: sócio, amigo, teste, cortesia.
//
// DUAS INVARIANTES, e as duas existem por motivo de segurança:
//
// 1. O plano sai de uma LISTA FECHADA. Sem isso, um valor qualquer vindo do
//    corpo da requisição viraria o Plan da pessoa, e `planOf()` cairia no
//    padrão silenciosamente. O limite diário passaria a ser o do Free sem
//    ninguém entender por quê.
// 2. Isto NUNCA devolve Role. Plano e permissão são colunas diferentes de
//    propósito: dar o plano mais caro para alguém não pode, em hipótese
//    nenhuma, dar acesso ao painel de admin junto. Quem for mexer aqui depois:
//    se precisar promover alguém a admin, é outro caminho, não este.
export const DIAS_MAX_CONCESSAO = 3650; // dez anos, que na prática é "sem prazo"

export function decideConcessaoDePlano({ plano, dias, planosValidos = [], atualMs = null, nowMs = Date.now() }) {
    if (!planosValidos.includes(plano)) {
        return { ok: false, erro: 'Plano desconhecido.' };
    }

    // Voltar para o Free tira a validade junto: deixar uma data velha para trás
    // faria o worker rebaixar de novo um plano que já é o mais baixo.
    if (plano === 'free') {
        return { ok: true, plano: 'free', expiraEm: null };
    }

    const n = Number(dias);
    if (!Number.isInteger(n) || n < 1 || n > DIAS_MAX_CONCESSAO) {
        return { ok: false, erro: `Dias deve ser um inteiro entre 1 e ${DIAS_MAX_CONCESSAO}.` };
    }

    // Reaproveita a mesma regra do pagamento: empilha sobre o que ainda resta,
    // em vez de encurtar quem já tinha tempo.
    return { ok: true, plano, expiraEm: computeExpiry(atualMs, n, nowMs) };
}
