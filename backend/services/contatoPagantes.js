import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';
import { limiteComBonus } from './indicacaoLogic.js';
import { sugestoesDePerfil } from './ampliarPerfil.js';
import { GRUPOS, grupoDoPagante, notaDoPagante, mensagemPara, whatsDe } from './contatoPagantesLogic.js';

// =========================
// Admin › Falar com pagantes: a parte com banco (regra em contatoPagantesLogic.js)
// =========================
// "Já falei" fica em AppSettings('contatoPagantes') = { [userId]: { em, por } }:
// sem migration, e a marca vale no celular e no computador do admin.

const CHAVE = 'contatoPagantes';
// O dono (e qualquer admin) não é pagante para conversar.
const admins = () => String(process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const dataBR = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

async function marcas() {
    const [r] = await sql`select "Value" from "AppSettings" where "Key" = ${CHAVE}`;
    return r?.Value && typeof r.Value === 'object' ? r.Value : {};
}

/** A lista inteira, numa consulta (mais a das marcas). */
export async function painelPagantes() {
    const rows = await sql`
        select u."Id", u."Name", u."Email", u."Plan", u."PlanExpiresAt", u."StripeCustomerId",
               u."AutoEnvio", u."GoogleConnected", u."BonusEnviosAte",
               (u."AutoEnvioUltimo" >= current_date) as "autoRodouHoje",
               coalesce(nullif(pf."Whatsapp", ''), pf."Phone") as telefone,
               (select count(*)::int from "Applications" a where a."UserId" = u."Id") as envios,
               (select count(*)::int from "Applications" a where a."UserId" = u."Id" and a."SentAt" >= current_date) as "enviadosHoje",
               (select count(*)::int from "SendQueue" s where s."UserId" = u."Id" and s."Status" = 'queued') as fila,
               (select max(a."SentAt") from "Applications" a where a."UserId" = u."Id") as "ultimoEnvio"
        from "Users" u left join "Profiles" pf on pf."UserId" = u."Id"
        where u."Plan" <> 'free' and (u."PlanExpiresAt" is null or u."PlanExpiresAt" > now())
          and coalesce(u."Role", '') <> 'admin' and lower(u."Email") <> all(${admins()}::text[])
        order by u."CreatedAt"`;
    const feitas = await marcas();
    const pessoas = rows.map((r) => {
        const p = {
            nome: r.Name, gmail: !!r.GoogleConnected, auto: !!r.AutoEnvio, autoRodouHoje: !!r.autoRodouHoje,
            hoje: r.enviadosHoje + r.fila, limite: limiteComBonus(planOf(r.Plan).dailyLimit, r.BonusEnviosAte), envios: r.envios,
        };
        return {
            id: r.Id, nome: r.Name, email: r.Email, plano: planOf(r.Plan).label || r.Plan, pago: !!r.StripeCustomerId,
            vence: r.PlanExpiresAt, telefone: r.telefone || null, whats: whatsDe(r.telefone),
            auto: p.auto, gmail: p.gmail, envios: r.envios, hoje: p.hoje, limite: p.limite, ultimoEnvio: r.ultimoEnvio,
            grupo: grupoDoPagante(p), nota: notaDoPagante(p),
            mensagem: mensagemPara(p, { venceEm: dataBR(r.PlanExpiresAt) }),
            falei: feitas[r.Id] || null,
        };
    });
    return { grupos: GRUPOS, pessoas };
}

/** Mensagem com a melhor sugestão de perfil medida no feed da pessoa (sob demanda: é cara). */
export async function mensagemComDica(userId) {
    const [u] = await sql`select "Id", "Name", "Plan", "PlanExpiresAt", "AutoEnvio", "GoogleConnected" from "Users" where "Id" = ${userId}`;
    if (!u) return null;
    const s = await sugestoesDePerfil(u);
    const dica = s.sugestoes?.[0] || null;
    const p = { nome: u.Name, gmail: !!u.GoogleConnected, auto: !!u.AutoEnvio, autoRodouHoje: true, hoje: 0, limite: 1, envios: 0 };
    return { vagas: s.total, sugestoes: s.sugestoes || [], mensagem: dica ? mensagemPara(p, { dica }) : null };
}

/** Marca (ou desmarca) "já falei". */
export async function marcarFalei(userId, falei, por) {
    const atual = await marcas();
    if (falei) atual[userId] = { em: new Date().toISOString(), por };
    else delete atual[userId];
    await sql`
        insert into "AppSettings" ("Key", "Value", "UpdatedBy", "UpdatedAt")
        values (${CHAVE}, ${sql.json(atual)}, ${por}, now())
        on conflict ("Key") do update set "Value" = excluded."Value", "UpdatedBy" = excluded."UpdatedBy", "UpdatedAt" = now()`;
    return atual[userId] || null;
}
