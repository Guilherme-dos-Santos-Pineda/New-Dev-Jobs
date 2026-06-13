// =========================
// Planos e limites (comércio)
// =========================
// Aplicado na API (gate de envio manual) e no worker (teto diário).
// Preços/recursos alinhados com a landing (pages/index.html).

export const PLANS = {
    free: {
        label: 'Free', dailyLimit: 7, allowManual: false, priority: 0,
        price: 0, period: 'para sempre grátis', popular: false,
        features: ['7 candidaturas por dia', '1 perfil de busca', 'matching básico', 'sem cartão de crédito'],
    },
    starter: {
        label: 'Starter', dailyLimit: 70, allowManual: true, priority: 5,
        price: 80, period: '/mês · 70 emails por dia', popular: true,
        features: ['70 candidaturas por dia', 'filtragem antes do envio', 'matching com IA', 'histórico de candidaturas', 'suporte por email'],
    },
    pro: {
        label: 'Pro', dailyLimit: 200, allowManual: true, priority: 10,
        price: 189, period: '/mês · 200 emails por dia', popular: false,
        features: ['200 candidaturas por dia', 'tudo do starter', 'tracking de abertura', 'multi-contas', 'agendamento automático', 'suporte prioritário'],
    },
};

export function planOf(name) {
    return PLANS[name] || PLANS.free;
}
