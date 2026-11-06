import { PLANOS_PAGOS_ATIVOS, FREE_SEM_PLANOS_PAGOS } from './planosPagos.js';

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

// Enquanto os planos pagos estão desligados (config/planosPagos.js), o grátis
// é o produto inteiro: 20 por dia e escolha vaga a vaga.
const FREE_PAGO_LIGADO = {
    label: 'Free', dailyLimit: 7, allowManual: false, priority: 0,
    price: 0, period: 'para sempre grátis', popular: false,
    desc: 'Para começar: envios diários limitados e matching básico.',
    features: ['7 candidaturas por dia', 'envio pelo seu Gmail, sem conectar nada', '1 perfil de busca', 'matching básico', 'sem cartão de crédito'],
};
const FREE_PAGO_DESLIGADO = {
    ...FREE_PAGO_LIGADO,
    ...FREE_SEM_PLANOS_PAGOS,
    period: 'grátis', desc: 'Tudo o que a ferramenta faz, sem pagar.',
    features: [`${FREE_SEM_PLANOS_PAGOS.dailyLimit} envios por dia`, 'você escolhe vaga a vaga', 'envio pelo seu Gmail', 'sem cartão de crédito'],
};

export const PLANS = {
    free: PLANOS_PAGOS_ATIVOS ? FREE_PAGO_LIGADO : FREE_PAGO_DESLIGADO,
    // O id continua 'starter' para não mexer na cobrança nem na env do preço.
    starter: {
        label: 'Automático', dailyLimit: 50, allowManual: true, autoSend: true, priority: 5,
        price: 10, period: 'pagamento único · 30 dias', popular: true,
        desc: 'Seu currículo sai todo dia para as vagas novas, sem você precisar entrar.',
        features: ['envio automático todo dia', 'até 50 envios por dia', 'só vagas novas com boa compatibilidade', 'desliga quando quiser'],
    },
    pro: {
        // Fora de venda: fica para quem já tem (concessão), que não perde nada.
        label: 'Pro', dailyLimit: 200, allowManual: true, autoSend: true, aVenda: false, priority: 10,
        price: 189, period: 'pagamento único · 30 dias', popular: false,
        desc: 'Para quem quer dominar o mercado: alto volume e recursos avançados.',
        features: ['200 candidaturas por dia', 'tudo do starter', 'suporte prioritário'],
    },
};

export function planOf(name) {
    return PLANS[name] || PLANS.free;
}
