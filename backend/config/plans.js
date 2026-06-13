// =========================
// Planos e limites (comércio)
// =========================
// Aplicado na API (gate de envio manual) e no worker (teto diário).
// O pagamento (Stripe) numa fase futura só precisa setar Users.Plan.

export const PLANS = {
    free: { label: 'Free', dailyLimit: 7, allowManual: false, priority: 0 },
    starter: { label: 'Starter', dailyLimit: 70, allowManual: true, priority: 5 },
    pro: { label: 'Pro', dailyLimit: 200, allowManual: true, priority: 10 },
};

export function planOf(name) {
    return PLANS[name] || PLANS.free;
}
