import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';
import { limiteComBonus } from './indicacaoLogic.js';

// =========================
// Uso diário do plano (fonte única da verdade)
// =========================
// Usado no gate de enfileiramento (routes/queue.js), no worker (teto por envio)
// e exposto na API (/auth/me, /billing/me, /stats). "Hoje" = data do servidor (UTC).

// Quantas candidaturas o usuário já ENVIOU hoje (envios reais contam para o teto).
export async function countSentToday(userId) {
    const [row] = await sql`
        select count(*)::int as count from "Applications"
        where "UserId" = ${userId} and "SentAt"::date = current_date`;
    return row.count;
}

/**
 * Resumo de plano + uso do usuário.
 * @returns { plan, label, dailyLimit, allowManual, usedToday, remainingToday }
 */
export async function planUsage(userId, planName) {
    const plan = planOf(planName);
    // Uma consulta só: o envio de hoje e o bônus de indicação (+10 por dia, indicacao.js).
    const [row] = await sql`
        select (select count(*)::int from "Applications" where "UserId" = ${userId} and "SentAt"::date = current_date) as count,
               (select "BonusEnviosAte" from "Users" where "Id" = ${userId}) as bonus`;
    const usedToday = row.count;
    const dailyLimit = limiteComBonus(plan.dailyLimit, row.bonus);
    return {
        plan: planName || 'free',
        label: plan.label,
        dailyLimit,
        bonusAte: dailyLimit > plan.dailyLimit ? row.bonus : null,
        allowManual: plan.allowManual,
        autoSend: !!plan.autoSend,
        usedToday,
        remainingToday: Math.max(0, dailyLimit - usedToday),
    };
}
