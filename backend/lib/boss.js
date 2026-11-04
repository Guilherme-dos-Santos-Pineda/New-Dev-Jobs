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

// De quanto em quanto tempo (s) cada fila pergunta ao banco se há trabalho. Fila
// vazia também custa: eram 178 mil consultas por dia, ~250 bytes cada, ~44 MB de
// egress diário sem ninguém usando o produto (o plano grátis tem 5 GB por ciclo).
// O envio pode esperar 10 s porque os itens de uma pessoa já saem a cada 60 a 120 s.
// NÃO suba o de envio sem `drenando`: sem ele a fila anda um item por intervalo.
export const POLL_S = { envio: 10, dlq: 60, scraper: 30 };

/**
 * Faz a fila seguir direto para o próximo item, sem esperar o intervalo. O worker
 * do pg-boss dorme entre um item e outro, e com intervalo de 10 s seriam só 6
 * envios por minuto para TODOS os usuários juntos. Avisado durante o item, ele
 * busca de novo na hora; achando a fila vazia, volta a dormir.
 */
export function drenando(handler, acordar) {
    return async (jobs) => {
        try {
            return await handler(jobs);
        } finally {
            acordar();
        }
    };
}

// ATENÇÃO: o pg-boss usa DATABASE_URL em SESSION mode (porta 5432) de propósito —
// ele depende de recursos de sessão (advisory locks / LISTEN-NOTIFY) que o
// transaction mode (6543) não preserva. Não troque para o pooler de transação.
// As queries da aplicação (lib/sql.js) é que vão no 6543. Ver comentário lá.
const url = process.env.DATABASE_URL;

let bossPromise = null;

async function createInstance() {
    const boss = new PgBoss({
        connectionString: url,
        ssl: { rejectUnauthorized: false }, // Supabase exige TLS (sem verificação de CA, igual ao sql.js)
        max: Number(process.env.PGBOSS_POOL_MAX) || 2,
        // O cron do pg-boss não é usado (os robôs vivem em "ScraperSchedules"), e
        // ligado ele consulta o banco a cada 5 s. Antes de usar boss.schedule(),
        // tire esta linha: com ela o agendamento é aceito e nunca dispara.
        schedule: false,
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
