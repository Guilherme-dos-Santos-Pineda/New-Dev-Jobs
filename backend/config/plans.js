// =========================
// Planos e limites (comércio)
// =========================
// Aplicado na API (gate de envio manual) e no worker (teto diário).
// Preços/recursos alinhados com a landing (pages/index.html).
//
// REGRA: só entra em `features` o que EXISTE no código.
// O Pro anunciava "tracking de abertura", "multi-contas" e "agendamento
// automático". Nenhum dos três tinha uma linha de implementação: eram string
// aqui e <li> na landing. Vender recurso inexistente não é problema de
// conversão, é estorno e reclamação. Antes de acrescentar um item nesta lista,
// aponte a função que o entrega.
//
// O que de fato separa os planos hoje é VOLUME (dailyLimit) e a seleção manual
// ampla (allowManual). `priority` não ordena nada ainda: fica aqui porque a API
// já o expõe, mas não vire feature de venda enquanto a fila não o usar.

export const PLANS = {
    free: {
        label: 'Free', dailyLimit: 7, allowManual: false, priority: 0,
        price: 0, period: 'para sempre grátis', popular: false,
        desc: 'Para começar: envios diários limitados e matching básico.',
        features: ['7 candidaturas por dia', 'envio pelo seu Gmail, sem conectar nada', '1 perfil de busca', 'matching básico', 'sem cartão de crédito'],
    },
    starter: {
        label: 'Starter', dailyLimit: 70, allowManual: true, priority: 5,
        price: 80, period: 'pagamento único · 30 dias', popular: true,
        desc: 'Ideal para quem está começando: mais envios e filtragem.',
        features: ['70 candidaturas por dia', 'filtragem antes do envio', 'matching com IA', 'histórico de candidaturas', 'suporte por email'],
    },
    pro: {
        label: 'Pro', dailyLimit: 200, allowManual: true, priority: 10,
        price: 189, period: 'pagamento único · 30 dias', popular: false,
        desc: 'Para quem quer dominar o mercado: alto volume e recursos avançados.',
        features: ['200 candidaturas por dia', 'tudo do starter', 'suporte prioritário'],
    },
};

export function planOf(name) {
    return PLANS[name] || PLANS.free;
}
