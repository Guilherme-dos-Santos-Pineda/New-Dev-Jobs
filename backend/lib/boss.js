import 'dotenv/config';
import { PgBoss } from 'pg-boss';

// =========================
// pg-boss — fila de envio no próprio Postgres (schema "pgboss")
// =========================
// Singleton por processo: tanto a API (que enfileira com boss.send) quanto o
// worker (que consome com boss.work) chamam getBoss(). Cada processo mantém
// sua própria instância conectada ao mesmo banco.

export const SEND_QUEUE = 'send-application';
export const SEND_DLQ = 'send-application-dlq';
export const SCRAPER_DISCOVERY = 'scraper-discovery';
export const SCRAPER_MONITORING = 'scraper-monitoring';

const url = process.env.DATABASE_URL;

let bossPromise = null;

async function createInstance() {
    const boss = new PgBoss({
        connectionString: url,
        ssl: { rejectUnauthorized: false }, // Supabase exige TLS (sem verificação de CA, igual ao sql.js)
        max: Number(process.env.PGBOSS_POOL_MAX) || 4,
    });
    boss.on('error', (e) => console.error('pg-boss erro:', e.message));
    await boss.start();

    // Cria as filas (idempotente). A DLQ recebe os envios que esgotaram o retry.
    await ensureQueue(boss, SEND_DLQ, {});
    await ensureQueue(boss, SEND_QUEUE, { deadLetter: SEND_DLQ });
    // Filas do scraper (runs disparados pelo admin → processados no worker).
    await ensureQueue(boss, SCRAPER_DISCOVERY, {});
    await ensureQueue(boss, SCRAPER_MONITORING, {});

    return boss;
}

async function ensureQueue(boss, name, options) {
    try {
        await boss.createQueue(name, options);
    } catch (e) {
        // já existe — segue o jogo
        if (!/already exists/i.test(e.message)) throw e;
    }
}

/**
 * Devolve a instância pg-boss já iniciada (ou null se DATABASE_URL ausente).
 */
export function getBoss() {
    if (!url) return Promise.resolve(null);
    if (!bossPromise) bossPromise = createInstance();
    return bossPromise;
}
