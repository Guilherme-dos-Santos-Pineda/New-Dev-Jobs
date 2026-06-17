import 'dotenv/config';
import sql from './lib/sql.js';
import { getBoss, SEND_QUEUE, SEND_DLQ, SCRAPER_DISCOVERY, SCRAPER_MONITORING } from './lib/boss.js';
import { applyToJob, ApplyError } from './services/sender.js';
import { runDiscovery, runMonitoring } from './services/scraper.js';
import { planOf } from './config/plans.js';
import { countSentToday } from './services/usage.js';

// =========================
// Worker de envio (processo separado: `npm run worker`)
// =========================
// Consome a fila pg-boss "send-application", chama applyToJob (Gmail API) e
// espelha o resultado em "SendQueue" para a UI. Retry/backoff por conta do
// pg-boss; o que esgota as tentativas cai na DLQ e é marcado como falha.

// Processa um envio. batchSize 1 → o array tem exatamente um job.
async function handleSend([job]) {
    const { userId, queueId, jobId } = job.data;

    const [row] = await sql`select "Status" from "SendQueue" where "Id" = ${queueId}`;
    if (!row || row.Status !== 'queued') return; // lote cancelado/substituído ou já processado

    // Teto diário do plano (envios reais de hoje)
    const [user] = await sql`select "Plan" from "Users" where "Id" = ${userId}`;
    const limit = planOf(user?.Plan).dailyLimit;
    const count = await countSentToday(userId);
    if (count >= limit) {
        await sql`update "SendQueue" set "Status" = 'skipped', "Error" = 'limite diário do plano atingido', "SentAt" = now() where "Id" = ${queueId}`;
        console.log(`⏸  limite diário (${limit}) atingido para user ${userId} — job ${jobId} pulado`);
        return;
    }

    try {
        const r = await applyToJob(userId, jobId);
        await sql`update "SendQueue" set "Status" = ${r.skipped ? 'skipped' : 'sent'}, "SentAt" = now() where "Id" = ${queueId}`;
        console.log(r.skipped ? `↦ já enviado antes: user ${userId} job ${jobId}` : `✉️  enviado: user ${userId} job ${jobId}`);
    } catch (e) {
        if (e instanceof ApplyError) {
            // Erro de negócio definitivo (vaga sem email, vaga removida…): marca falha, não retenta.
            await sql`update "SendQueue" set "Status" = 'failed', "Error" = ${(e.message || 'erro').slice(0, 200)}, "SentAt" = now() where "Id" = ${queueId}`;
            console.warn(`✖ falha definitiva: user ${userId} job ${jobId}: ${e.message}`);
            return;
        }
        // Erro transitório (rede / Gmail 429/5xx): relança para o pg-boss tentar de novo com backoff.
        console.warn(`↻ falha transitória: user ${userId} job ${jobId}: ${e.message} — retry`);
        throw e;
    }
}

// Dead-letter: envios que esgotaram o retry → marca falha no espelho.
async function handleDlq([job]) {
    const { userId, queueId, jobId } = job.data;
    await sql`
        update "SendQueue"
        set "Status" = 'failed', "Error" = coalesce("Error", 'falha após várias tentativas'), "SentAt" = now()
        where "Id" = ${queueId} and "Status" = 'queued'`;
    console.error(`✖ dead-letter: user ${userId} job ${jobId} (esgotou as tentativas)`);
}

// Executa um run do scraper (disparado pelo admin). Marca ScraperRuns running→done/failed.
function makeScraperHandler(fn, label) {
    return async ([job]) => {
        const { runId, params } = job.data || {};
        console.log(`🕷️  scraper ${label} iniciando (run ${runId})…`);
        if (runId) await sql`update "ScraperRuns" set "Status" = 'running', "StartedAt" = now() where "Id" = ${runId}`;
        try {
            const stats = await fn({ ...(params || {}), runId });
            if (runId) await sql`update "ScraperRuns" set "Status" = 'done', "Stats" = ${sql.json(stats)}, "FinishedAt" = now() where "Id" = ${runId}`;
            console.log(`✅ scraper ${label} concluído (run ${runId}):`, JSON.stringify(stats));
        } catch (e) {
            if (runId) await sql`update "ScraperRuns" set "Status" = 'failed', "Error" = ${(e.message || 'erro').slice(0, 300)}, "FinishedAt" = now() where "Id" = ${runId}`;
            console.error(`❌ scraper ${label} falhou (run ${runId}):`, e.message);
        }
    };
}

// =========================
// Agendador (robôs): a cada 60s reivindica os ScraperSchedules vencidos de forma
// ATÔMICA (o update já marca o próximo disparo → seguro com múltiplos workers) e
// enfileira o run. A fila do scraper é batchSize 1, então rodam um de cada vez.
// =========================
async function runDueSchedules(boss) {
    const due = await sql`
        update "ScraperSchedules"
        set "LastRunAt" = now(),
            "NextRunAt" = now() + interval '1 minute' * "IntervalMinutes",
            "UpdatedAt" = now()
        where "Active" = true and ("NextRunAt" is null or "NextRunAt" <= now())
        returning *`;
    for (const sch of due) {
        const params = sch.Params || {};
        const [run] = await sql`
            insert into "ScraperRuns" ("Type", "Status", "Params")
            values (${sch.Type}, 'queued', ${sql.json({ ...params, scheduleId: Number(sch.Id), scheduleName: sch.Name })})
            returning "Id"`;
        const queue = sch.Type === 'discovery' ? SCRAPER_DISCOVERY : SCRAPER_MONITORING;
        await boss.send(queue, { runId: Number(run.Id), params }, { retryLimit: 0, expireInSeconds: 1800 });
        console.log(`⏰ robô "${sch.Name}" (${sch.Type}) → run ${run.Id} enfileirado`);
    }
    return due.length;
}

function startScheduler(boss) {
    const tick = () => runDueSchedules(boss).catch((e) => console.error('scheduler tick falhou:', e.message));
    tick(); // dispara uma vez no boot (pega os vencidos enquanto o worker esteve fora)
    return setInterval(tick, 60000);
}

async function main() {
    const boss = await getBoss();
    if (!boss) {
        console.error('DATABASE_URL ausente — o worker não pode iniciar.');
        process.exit(1);
    }

    await boss.work(SEND_QUEUE, { batchSize: 1, pollingIntervalSeconds: 1 }, handleSend);
    await boss.work(SEND_DLQ, { batchSize: 1, pollingIntervalSeconds: 5 }, handleDlq);
    // Scraper: 1 run por vez (sem concorrência) para não duplicar custo Apify.
    await boss.work(SCRAPER_DISCOVERY, { batchSize: 1, pollingIntervalSeconds: 3 }, makeScraperHandler(runDiscovery, 'discovery'));
    await boss.work(SCRAPER_MONITORING, { batchSize: 1, pollingIntervalSeconds: 3 }, makeScraperHandler(runMonitoring, 'monitoring'));

    // Agendador dos robôs (ScraperSchedules)
    const scheduler = startScheduler(boss);
    console.log(`🤖 worker ativo: envios${DEV_LABEL()} + scraper (discovery/monitoring) + agendador`);

    const shutdown = async (sig) => {
        console.log(`\n${sig} recebido — encerrando worker…`);
        clearInterval(scheduler);
        try { await boss.stop({ graceful: true, timeout: 30000 }); } catch {}
        process.exit(0);
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

function DEV_LABEL() {
    const ms = Number(process.env.SEND_INTERVAL_MS) || 0;
    return ms ? `, espaçamento dev ${ms}ms` : ', espaçamento 60–120s';
}

main().catch((e) => {
    console.error('worker falhou ao iniciar:', e);
    process.exit(1);
});
