import sql from '../lib/sql.js';
import { getBoss, SEND_QUEUE } from '../lib/boss.js';

// =========================
// Fila de envio (Fase 4) — pg-boss + worker separado
// =========================
// A API só ENFILEIRA aqui (boss.send com startAfter espaçado). Quem processa é
// o backend/worker.js (boss.work). A tabela "SendQueue" é o espelho da fila para
// a UI; a execução/retry vive no schema "pgboss".

// Espaçamento entre envios: 60–120s (anti-block do Gmail).
// Em dev, SEND_INTERVAL_MS força um valor curto fixo para testes.
const DEV_INTERVAL_MS = Number(process.env.SEND_INTERVAL_MS) || 0;
function gapSeconds() {
    if (DEV_INTERVAL_MS) return Math.max(1, Math.round(DEV_INTERVAL_MS / 1000));
    return 60 + Math.floor(Math.random() * 60); // 60–120s
}

// Retry/backoff do pg-boss para falhas transitórias (rede / Gmail 429/5xx).
const SEND_OPTS = { retryLimit: 3, retryDelay: 60, retryBackoff: true, expireInSeconds: 120 };

export async function enqueue(userId, jobIds) {
    if (!jobIds.length) { await sql`delete from "SendQueue" where "UserId" = ${userId}`; return getStatus(userId); }

    // Espaçamento cumulativo calculado em JS (o 1º é imediato). ScheduledAt já vem
    // no insert — evita 1 UPDATE por item.
    const now = Date.now();
    let cumulative = 0;
    const plan = jobIds.map((jid) => {
        const startAfter = cumulative;
        cumulative += gapSeconds();
        return { UserId: userId, JobId: jid, Status: 'queued', ScheduledAt: new Date(now + startAfter * 1000), _startAfter: startAfter };
    });

    // Grava o lote em UMA query (novo lote substitui o anterior).
    const rows = await sql.begin(async (tx) => {
        await tx`delete from "SendQueue" where "UserId" = ${userId}`;
        return tx`insert into "SendQueue" ${tx(plan.map(({ _startAfter, ...r }) => r), 'UserId', 'JobId', 'Status', 'ScheduledAt')} returning "Id", "JobId"`;
    });

    // Agenda no pg-boss SEQUENCIALMENTE — o pool do pg-boss é pequeno (2) e o
    // pooler do Supabase limita ~15 conexões no total; disparar em paralelo (ex.:
    // 150+ de uma vez) estourava o pool e derrubava o request com 500.
    const boss = await getBoss();
    if (boss) {
        for (let i = 0; i < rows.length; i += 1) {
            await boss.send(
                SEND_QUEUE,
                { userId, queueId: Number(rows[i].Id), jobId: Number(rows[i].JobId) },
                { ...SEND_OPTS, startAfter: plan[i]._startAfter },
            );
        }
    } else {
        console.warn('⚠️  pg-boss indisponível — itens enfileirados mas não serão processados (DATABASE_URL?)');
    }

    return getStatus(userId);
}

export async function stop(userId) {
    // Remove os pendentes do espelho; os jobs já agendados no pg-boss que
    // apontarem para linhas removidas viram no-op no worker.
    await sql`delete from "SendQueue" where "UserId" = ${userId} and "Status" = 'queued'`;
    return getStatus(userId);
}

export async function getStatus(userId) {
    const rows = await sql`select * from "SendQueue" where "UserId" = ${userId} order by "Id" asc`;
    const sent = rows.filter((r) => r.Status === 'sent').length;
    const failed = rows.filter((r) => r.Status === 'failed').length;
    const skipped = rows.filter((r) => r.Status === 'skipped').length;
    const pending = rows.filter((r) => r.Status === 'queued').length;
    const active = pending > 0;

    // Próximo envio = menor ScheduledAt entre os pendentes
    let nextInSeconds = null;
    if (active) {
        const times = rows
            .filter((r) => r.Status === 'queued' && r.ScheduledAt)
            .map((r) => new Date(r.ScheduledAt).getTime());
        if (times.length) nextInSeconds = Math.max(0, Math.round((Math.min(...times) - Date.now()) / 1000));
    }

    return {
        total: rows.length, sent, failed, skipped, pending, active, nextInSeconds,
        items: rows.map((r) => ({ jobId: r.JobId, status: r.Status, error: r.Error, sentAt: r.SentAt })),
    };
}
