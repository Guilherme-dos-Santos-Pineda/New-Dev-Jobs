import { FREE_SEM_PLANOS_PAGOS } from './planosPagos.js';

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

// O grátis é o mesmo com a venda aberta ou não: 20 por dia e escolha vaga a vaga.
// Decisão do dono: o plano pago vende o envio sozinho, não tira nada de quem não paga.
const FREE = {
    label: 'Free', priority: 0, price: 0, popular: false,
    ...FREE_SEM_PLANOS_PAGOS,
    period: 'grátis', desc: 'Tudo o que a ferramenta faz, com um clique seu em cada envio.',
    features: [`${FREE_SEM_PLANOS_PAGOS.dailyLimit} envios por dia`, 'você escolhe vaga a vaga', 'envio pelo seu Gmail', 'sem cartão de crédito'],
};

export const PLANS = {
    free: FREE,
    // O id continua 'starter' para não mexer na cobrança nem na env do preço.
    starter: {
        label: 'Automático', dailyLimit: 50, allowManual: true, autoSend: true, priority: 5,
        price: 10, period: 'pagamento único · 30 dias', popular: true,
        desc: 'Você para de entrar todo dia para mandar currículo: a gente manda por você.',
        features: ['seu currículo sai sozinho todo dia às 9h, sem você entrar', '50 envios por dia, em vez de 20', 'vagas do seu perfil, as da semana primeiro', 'sai do seu Gmail, com o seu nome', 'liga e desliga quando quiser'],
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
