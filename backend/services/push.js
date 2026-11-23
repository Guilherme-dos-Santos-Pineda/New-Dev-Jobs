import webpush from 'web-push';
import sql from '../lib/sql.js';
import { getMatches } from './jobsQuery.js';
import { planOf } from '../config/plans.js';
import {
    prefsCompletas, vagasNovas, avisoVagas, avisoPlano, inscricaoMorta, HORA_DO_RESUMO_UTC,
} from './pushLogic.js';

// =========================
// Notificação no celular (Web Push): a parte com banco e envio (regra em pushLogic.js)
// =========================
// Chaves VAPID no .env (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT). Sem
// elas tudo isto fica desligado: a tela não oferece e nada é enviado.

const PUBLICA = (process.env.VAPID_PUBLIC_KEY || '').trim();
const PRIVADA = (process.env.VAPID_PRIVATE_KEY || '').trim();
export const pushLigado = !!(PUBLICA && PRIVADA);
if (pushLigado) webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:newdevoficial@gmail.com', PUBLICA, PRIVADA);

export const chavePublica = () => (pushLigado ? PUBLICA : null);

export async function inscrever(userId, sub, aparelho) {
    const endpoint = String(sub?.endpoint || '');
    const p256dh = String(sub?.keys?.p256dh || '');
    const auth = String(sub?.keys?.auth || '');
    // Só endpoints https de verdade: o servidor vai fazer POST para esse endereço.
    if (!/^https:\/\/[^\s]{10,1000}$/.test(endpoint) || !p256dh || !auth || p256dh.length > 200 || auth.length > 100) {
        throw new Error('Inscrição inválida.');
    }
    await sql`
        insert into "PushInscricoes" ("UserId", "Endpoint", "P256dh", "Auth", "Aparelho")
        values (${userId}, ${endpoint}, ${p256dh}, ${auth}, ${String(aparelho || '').slice(0, 120) || null})
        on conflict ("Endpoint") do update set "UserId" = excluded."UserId", "P256dh" = excluded."P256dh", "Auth" = excluded."Auth"`;
}

export async function cancelar(userId, endpoint) {
    await sql`delete from "PushInscricoes" where "UserId" = ${userId} and "Endpoint" = ${String(endpoint || '')}`;
}

export async function estadoDe(userId) {
    const [u] = await sql`select "NotifPrefs" from "Users" where "Id" = ${userId}`;
    const [n] = await sql`select count(*)::int n from "PushInscricoes" where "UserId" = ${userId}`;
    return { ligado: pushLigado, aparelhos: n.n, prefs: prefsCompletas(u?.NotifPrefs) };
}

/** Manda para todos os aparelhos da pessoa. Devolve quantos receberam. */
async function mandar(userId, aviso) {
    const subs = await sql`select "Id", "Endpoint", "P256dh", "Auth" from "PushInscricoes" where "UserId" = ${userId}`;
    let ok = 0;
    for (const s of subs) {
        try {
            await webpush.sendNotification(
                { endpoint: s.Endpoint, keys: { p256dh: s.P256dh, auth: s.Auth } },
                JSON.stringify(aviso),
                { TTL: 12 * 3600 },
            );
            ok++;
            await sql`update "PushInscricoes" set "UltimoOkEm" = now() where "Id" = ${s.Id}`;
        } catch (e) {
            if (inscricaoMorta(e.statusCode)) await sql`delete from "PushInscricoes" where "Id" = ${s.Id}`;
            else console.warn(`push: falhou para user ${userId}: ${e.statusCode || ''} ${e.message}`);
        }
    }
    return ok;
}

/**
 * Avisa a pessoa, se ela quer esse tipo e ainda não recebeu hoje. Nunca lança:
 * aviso que falha não pode derrubar o envio, o prêmio nem o tique.
 */
export async function avisar(userId, tipo, aviso, { forcar = false } = {}) {
    if (!pushLigado || !aviso) return false;
    try {
        const [u] = await sql`select "NotifPrefs" from "Users" where "Id" = ${userId}`;
        if (!forcar && !prefsCompletas(u?.NotifPrefs)[tipo]) return false;
        const [tem] = await sql`select 1 from "PushInscricoes" where "UserId" = ${userId} limit 1`;
        if (!tem) return false;
        if (!forcar) {
            const marcou = await sql`
                insert into "NotificacoesEnviadas" ("UserId", "Tipo", "Detalhe") values (${userId}, ${tipo}, ${aviso.title})
                on conflict do nothing returning "UserId"`;
            if (!marcou.length) return false; // já avisou hoje
        }
        return (await mandar(userId, aviso)) > 0;
    } catch (e) {
        console.warn(`push (${tipo}): ${e.message}`);
        return false;
    }
}

// =========================
// Resumo do dia: vagas novas e plano acabando, ao meio-dia de Brasília
// =========================
let concluidoEm = '';
let rodando = false;

export async function tickNotificacoes(agora = Date.now()) {
    const dia = new Date(agora).toISOString().slice(0, 10);
    if (!pushLigado || rodando || concluidoEm === dia || new Date(agora).getUTCHours() < HORA_DO_RESUMO_UTC) return;
    rodando = true;
    try {
        // Só quem tem aparelho inscrito: o feed de cada um custa memória e consultas.
        const pessoas = await sql`
            select distinct u."Id", u."Plan", u."PlanExpiresAt", u."NotifPrefs"
            from "Users" u join "PushInscricoes" p on p."UserId" = u."Id" limit 2000`;
        let enviados = 0;
        for (const u of pessoas) {
            if (planOf(u.Plan).autoSend && await avisar(u.Id, 'plano', avisoPlano(u.PlanExpiresAt, agora))) enviados++;
            try {
                const n = vagasNovas(await getMatches(u.Id), agora);
                if (await avisar(u.Id, 'vagas', avisoVagas(n))) enviados++;
            } catch (e) { console.warn(`push vagas user ${u.Id}: ${e.message}`); }
        }
        console.log(`🔔 resumo do dia: ${enviados} aviso(s) para ${pessoas.length} pessoa(s) com o app inscrito`);
        concluidoEm = dia;
    } finally {
        rodando = false;
    }
}
