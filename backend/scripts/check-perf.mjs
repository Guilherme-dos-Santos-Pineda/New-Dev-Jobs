#!/usr/bin/env node
// Mede o custo real das consultas do dashboard e do ranking. Rodar NA VM:
//
//   node /opt/newdevjobs/backend/scripts/check-perf.mjs
//
// Existe porque "não está carregando" pode ser lentidão, erro ou memória — e os
// três se parecem na tela. Aqui cada consulta é cronometrada em separado, com o
// volume de dados que ela move, para o gargalo aparecer sozinho.
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env') });
const { default: sql } = await import('../lib/sql.js');

if (!sql) { console.error('DATABASE_URL ausente'); process.exit(1); }

const ms = (t) => `${(Number(process.hrtime.bigint() - t) / 1e6).toFixed(0)} ms`;
async function timed(label, fn) {
    const t = process.hrtime.bigint();
    try {
        const r = await fn();
        console.log(`  ${ms(t).padStart(8)}  ${label}`);
        return r;
    } catch (e) {
        console.log(`  ${'ERRO'.padStart(8)}  ${label} — ${e.message}`);
        return null;
    }
}

console.log('\n=== Volume das tabelas ===');
const [vol] = await sql`
    select (select count(*) from "Jobs")::int          as jobs,
           (select count(*) from "Applications")::int  as apps,
           (select count(*) from "Users")::int         as users,
           (select count(*) from "Jobs"
             where "Email" is not null and "Email" <> '')::int as jobs_com_email`;
console.log(`  Jobs: ${vol.jobs}  ·  com email: ${vol.jobs_com_email}  ·  Applications: ${vol.apps}  ·  Users: ${vol.users}`);

const [tam] = await sql`
    select pg_size_pretty(pg_total_relation_size('"Jobs"'))          as jobs,
           pg_size_pretty(pg_total_relation_size('"Applications"'))  as apps,
           coalesce(avg(length("Description")), 0)::int              as desc_medio
    from "Jobs"`;
console.log(`  tamanho: Jobs ${tam.jobs} · Applications ${tam.apps} · Description média ${tam.desc_medio} chars`);

console.log('\n=== Consultas (tempo de ida e volta) ===');

await timed('ranking — CreatedAt::date (índice NÃO usado)', () => sql`
    select u."Id", u."Name", count(a."Id")::int as sent
    from "Applications" a join "Users" u on u."Id" = a."UserId"
    where a."CreatedAt"::date = current_date
    group by u."Id", u."Name" order by sent desc limit 10`);

await timed('ranking — intervalo (índice USADO)', () => sql`
    select u."Id", u."Name", count(a."Id")::int as sent
    from "Applications" a join "Users" u on u."Id" = a."UserId"
    where a."CreatedAt" >= current_date and a."CreatedAt" < current_date + 1
    group by u."Id", u."Name" order by sent desc limit 10`);

await timed('dashboard — sparkline de Jobs (7× varredura)', () => sql`
    select count(j."Id")::int as c
    from generate_series(current_date - interval '6 days', current_date, interval '1 day') d
    left join "Jobs" j on j."CreatedAt"::date = d::date
    group by d order by d`);

const linhas = await timed('getMatches — SELECT j.* SEM LIMIT  ⚠️', () => sql`
    select j.* from "Jobs" j
    where j."Email" is not null and j."Email" <> ''
    order by j."CreatedAt" desc, j."Id" desc`);

if (linhas) {
    const bytes = Buffer.byteLength(JSON.stringify(linhas));
    console.log(`            → ${linhas.length} linhas, ~${(bytes / 1024 / 1024).toFixed(1)} MB trafegados POR CARREGAMENTO do dashboard`);
    if (vol.jobs_com_email) {
        const por20k = (bytes / vol.jobs_com_email) * 20000 / 1024 / 1024;
        console.log(`            → na meta de 20.000 vagas isso vira ~${por20k.toFixed(0)} MB por requisição`);
    }
}

console.log(`\n  RSS deste processo: ${(process.memoryUsage().rss / 1024 / 1024).toFixed(0)} MB\n`);
process.exit(0);
