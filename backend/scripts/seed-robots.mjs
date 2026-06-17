import 'dotenv/config';
import sql from '../lib/sql.js';

// =========================================================================
// Cria os robôs de coleta (ScraperSchedules) prontos para o worker disparar.
// Idempotente: pula robôs cujo Name já existe. Roda no próximo tick do worker.
//
//   node backend/scripts/seed-robots.mjs
//
// ⚠️ Eles GASTAM crédito Apify assim que o worker rodar. Comece com os números
//    abaixo e ajuste (maxPosts/scrapePages/IntervalMinutes) conforme o saldo.
//    Acompanhe o gasto em console.apify.com. Pause/edite na aba Admin → Bots.
// =========================================================================

const FOREIGN_QUERIES = [
    '"hiring software engineer"', '"hiring backend developer"', '"hiring frontend developer"',
    '"hiring full stack developer"', '"we are hiring developer"', '"hiring react developer"',
    '"hiring node developer"', '"hiring python developer"',
];
const BR_QUERIES = [
    '"vaga desenvolvedor"', '"estamos contratando desenvolvedor"', '"vaga pessoa desenvolvedora"',
    '"contratando desenvolvedor"', '"vaga back-end"', '"vaga full stack"', '"vaga react"',
];

const robots = [
    {
        name: 'Gringas — global (6h)', type: 'monitoring', intervalMinutes: 360,
        params: { source: 'global', region: 'global', queries: FOREIGN_QUERIES, contentType: 'jobs',
            maxPosts: 20, scrapePages: 2, postedLimit: 'week', sortBy: 'date' },
    },
    {
        name: 'Brasil — global (6h)', type: 'monitoring', intervalMinutes: 360,
        params: { source: 'global', region: 'br', queries: BR_QUERIES, contentType: 'jobs',
            maxPosts: 20, scrapePages: 2, postedLimit: 'month', sortBy: 'date' },
    },
    {
        name: 'Descoberta BR (1x/dia)', type: 'discovery', intervalMinutes: 1440,
        params: { queries: ['Tech Recruiter', 'Talent Acquisition', 'Recrutador TI'],
            locations: ['Brazil'], maxResults: 25, takePages: 1 },
    },
];

(async () => {
    if (!sql) { console.error('DATABASE_URL ausente no .env'); process.exit(1); }
    let created = 0, skipped = 0;
    for (const r of robots) {
        const [exists] = await sql`select "Id" from "ScraperSchedules" where "Name" = ${r.name}`;
        if (exists) { console.log(`= já existe: ${r.name}`); skipped += 1; continue; }
        await sql`
            insert into "ScraperSchedules" ("Name", "Type", "Params", "IntervalMinutes", "Active", "NextRunAt")
            values (${r.name}, ${r.type}, ${sql.json(r.params)}, ${r.intervalMinutes}, true, now())`;
        console.log(`+ criado: ${r.name} (${r.type}, a cada ${r.intervalMinutes}min)`);
        created += 1;
    }
    console.log(`\n✅ ${created} robô(s) criado(s), ${skipped} já existiam. O worker dispara no próximo ciclo (≤1 min).`);
    await sql.end();
    process.exit(0);
})().catch((e) => { console.error('❌ Falha:', e.message); process.exit(1); });
