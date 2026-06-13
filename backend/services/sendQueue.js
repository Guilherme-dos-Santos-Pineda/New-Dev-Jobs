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
    // Grava o lote no SendQueue (novo lote substitui o anterior)
    const rows = await sql.begin(async (tx) => {
        await tx`delete from "SendQueue" where "UserId" = ${userId}`;
        const inserted = [];
        for (const jid of jobIds) {
            const [r] = await tx`
                insert into "SendQueue" ("UserId", "JobId", "Status")
                values (${userId}, ${jid}, 'queued')
                returning "Id", "JobId"`;
            inserted.push(r);
        }
        return inserted;
    });

    // Agenda cada item no pg-boss com startAfter cumulativo (o 1º é imediato)
    const boss = await getBoss();
    let cumulative = 0;
    for (const r of rows) {
        const startAfter = cumulative; // segundos a partir de agora
        await sql`update "SendQueue" set "ScheduledAt" = now() + (${startAfter} * interval '1 second') where "Id" = ${r.Id}`;
        if (boss) {
            await boss.send(
                SEND_QUEUE,
                { userId, queueId: Number(r.Id), jobId: Number(r.JobId) },
                { ...SEND_OPTS, startAfter },
            );
        }
        cumulative += gapSeconds();
    }
    if (!boss) console.warn('⚠️  pg-boss indisponível — itens enfileirados mas não serão processados (DATABASE_URL?)');

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
