// =========================
// Plano de IA e teste de 48 horas: a regra PURA (sem SQL), testável
// =========================
// Decisão do dono (11/11/2026):
//   - todo mundo testa por 48 h a partir do primeiro uso: 1 análise e 1 currículo
//     adaptado (versão por tipo de vaga);
//   - depois, a IA é um plano à parte: R$ 5, 30 dias, 10 usos (análises e versões
//     somam), comprado em Currículo IA;
//   - quem comprou o Automático ganha a IA junto, como agradecimento (grantOneTime).
// Custo medido: ~US$ 0,02 a 0,03 por uso no gpt-5.4-mini. 10 usos ≈ US$ 0,30.

export const IA_PRECO = 5;
export const IA_DIAS = 30;
export const IA_USOS = 10;
export const IA_TESTE_HORAS = 48;
export const IA_TESTE_ANALISES = 1;
export const IA_TESTE_VERSOES = 1;

const HORA = 3600_000;
const ms = (d) => (d ? new Date(d).getTime() : null);

/**
 * O que a pessoa pode fazer com a IA agora.
 * @param {object} p
 * @param {number} p.agora
 * @param {boolean} [p.admin]       sem limite
 * @param {Date|string} [p.iaAte]   IA liberada até (compra, Automático ou admin)
 * @param {Date|string} [p.testeDesde] primeiro uso no teste
 * @param {number} [p.usosPlano]    usos desde o início do período pago
 * @param {{analise:number, versao:number}} [p.usosTeste] usos dentro das 48 h
 * @param {number} [p.extras]       usos a mais dados pelo admin
 * @returns {{ modo: 'admin'|'plano'|'teste'|'novo'|'fim', ate: number|null, podeAnalisar: boolean,
 *            podeVersao: boolean, restantes: number|null, analisesRestantes: number|null,
 *            versoesRestantes: number|null, nosEnvios: boolean }}
 */
export function estadoIa({ agora = Date.now(), admin = false, iaAte = null, testeDesde = null, usosPlano = 0, usosTeste = {}, extras = 0 } = {}) {
    const extra = Math.max(0, Number(extras) || 0);
    if (admin) {
        return { modo: 'admin', ate: null, podeAnalisar: true, podeVersao: true, restantes: null, analisesRestantes: null, versoesRestantes: null, nosEnvios: true };
    }
    const ate = ms(iaAte);
    if (ate && ate > agora) {
        const restantes = Math.max(0, IA_USOS + extra - (Number(usosPlano) || 0));
        return { modo: 'plano', ate, podeAnalisar: restantes > 0, podeVersao: restantes > 0, restantes, analisesRestantes: restantes, versoesRestantes: restantes, nosEnvios: true };
    }
    const inicio = ms(testeDesde);
    if (!inicio) {
        // Ainda não usou: o teste começa no primeiro uso.
        return { modo: 'novo', ate: null, podeAnalisar: true, podeVersao: true, restantes: null,
            analisesRestantes: IA_TESTE_ANALISES + extra, versoesRestantes: IA_TESTE_VERSOES, nosEnvios: false };
    }
    const fimTeste = inicio + IA_TESTE_HORAS * HORA;
    if (agora < fimTeste) {
        const analisesRestantes = Math.max(0, IA_TESTE_ANALISES + extra - (Number(usosTeste.analise) || 0));
        const versoesRestantes = Math.max(0, IA_TESTE_VERSOES - (Number(usosTeste.versao) || 0));
        return { modo: 'teste', ate: fimTeste, podeAnalisar: analisesRestantes > 0, podeVersao: versoesRestantes > 0, restantes: null,
            analisesRestantes, versoesRestantes, nosEnvios: true };
    }
    return { modo: 'fim', ate: fimTeste, podeAnalisar: false, podeVersao: false, restantes: 0, analisesRestantes: 0, versoesRestantes: 0, nosEnvios: false };
}

/** Nova validade ao comprar: empilha sobre o que ainda resta, e os 10 usos recomeçam. */
export function validadeDaCompra(iaAteAtual, agora = Date.now(), dias = IA_DIAS) {
    const base = Math.max(agora, ms(iaAteAtual) || 0);
    return { iaAte: base + dias * 24 * HORA, iaDesde: agora };
}

/** O item do checkout do plano de IA, com o preço daqui (sem preço criado na Stripe). */
export function itemDoCheckoutIa() {
    return {
        quantity: 1,
        price_data: {
            currency: 'brl',
            unit_amount: Math.round(IA_PRECO * 100),
            product_data: { name: `New Dev Jobs IA no currículo (${IA_DIAS} dias, ${IA_USOS} usos)` },
        },
    };
}
