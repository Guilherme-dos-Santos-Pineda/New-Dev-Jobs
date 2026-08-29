#!/usr/bin/env node
// Preenche/atualiza as colunas derivadas de "Jobs" (Area, Level, Mods, IsBR).
//
//   node backend/scripts/reclassify-jobs.mjs          # só as linhas defasadas
//   node backend/scripts/reclassify-jobs.mjs --all    # a base inteira
//
// Rode isto SEMPRE que mexer em classify.js e subir o CLASSIFY_VERSION — senão
// as vagas antigas continuam com a regra antiga, em silêncio.
//
// Processa em lotes e só lê as colunas de que o classificador precisa: carregar
// "Description" de 50 mil vagas de uma vez estoura a RAM da VM (954 MB).
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const { default: sql } = await import('../lib/sql.js');
const { classifyJob, CLASSIFY_VERSION } = await import('../services/classify.js');

if (!sql) { console.error('DATABASE_URL ausente'); process.exit(1); }

const todas = process.argv.includes('--all');
const LOTE = Number(process.env.RECLASSIFY_BATCH) || 500;

const [{ n: pendentes }] = todas
    ? await sql`select count(*)::int as n from "Jobs"`
    : await sql`select count(*)::int as n from "Jobs" where "ClassVersion" < ${CLASSIFY_VERSION}`;

console.log(`classificador v${CLASSIFY_VERSION} — ${pendentes} vaga(s) a processar (lote de ${LOTE})`);
if (!pendentes) { await sql.end(); process.exit(0); }

let feitas = 0;
const contagem = {};
let ultimoId = 0;

for (;;) {
    const rows = todas
        ? await sql`
            select "Id", "JobTitle", "Description", "Skills", "Modality", "Location", "Email"
            from "Jobs" where "Id" > ${ultimoId} order by "Id" limit ${LOTE}`
        : await sql`
            select "Id", "JobTitle", "Description", "Skills", "Modality", "Location", "Email"
            from "Jobs" where "ClassVersion" < ${CLASSIFY_VERSION} order by "Id" limit ${LOTE}`;
    if (!rows.length) break;
    ultimoId = Number(rows[rows.length - 1].Id);

    // Um único UPDATE ... FROM (values ...) por lote: 500 round-trips viram 1.
    const valores = rows.map((j) => {
        const c = classifyJob(j);
        contagem[c.area] = (contagem[c.area] || 0) + 1;
        return [Number(j.Id), c.area, c.level, c.mods ? JSON.stringify(c.mods) : null, c.isBR];
    });

    await sql`
        update "Jobs" j set
            "Area" = v.area, "Level" = v.level,
            "Mods" = v.mods::jsonb, "IsBR" = v.isbr,
            "ClassVersion" = ${CLASSIFY_VERSION}
        from (values ${sql(valores)}) as v(id, area, level, mods, isbr)
        where j."Id" = v.id::bigint`;

    feitas += rows.length;
    process.stdout.write(`\r  ${feitas}/${pendentes}`);
}

console.log(`\n✅ ${feitas} vaga(s) classificada(s)`);
console.log('distribuição por área:', Object.entries(contagem).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' '));
await sql.end();
