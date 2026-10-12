#!/usr/bin/env node
// Desfaz a promoção em massa de 04/10/2026 SÓ para quem não tem vaga BR.
//
//   node backend/scripts/rebaixar-promocao-em-massa.mjs            (simula)
//   node backend/scripts/rebaixar-promocao-em-massa.mjs --commit   (aplica)
//
// Em 04/10/2026, às 19h UTC, 4084 recrutadores foram passados para 'approved'
// de uma vez. 3556 deles nunca tiveram vaga BR (vieram das antigas buscas em
// inglês) e, como 'approved' torna monitorável mesmo sem vaga, eles levariam
// ~84% do crédito da Apify. Os aprovados ANTES de outubro foram escolha humana
// e não são tocados. Os IDs alterados vão para recrutadores-rebaixados.json
// (gitignored) para dar para desfazer.
import dotenv from 'dotenv';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env'), quiet: true });
const { default: sql } = await import('../lib/sql.js');

const COMMIT = process.argv.includes('--commit');
const alvo = sql`r."Status" = 'approved'
    and r."UpdatedAt" >= '2026-10-04T19:00:00Z' and r."UpdatedAt" < '2026-10-04T20:00:00Z'
    and not exists (
        select 1 from "Jobs" j
        where j."RecruiterId" = r."Id" and j."IsBR" is not false and j."Email" like '%@%.%'
    )`;

try {
    const rows = await sql`select r."Id" from "Recruiters" r where ${alvo}`;
    console.log(`${rows.length} recrutador(es) aprovados em massa sem vaga BR`);
    if (!COMMIT) {
        console.log('simulação: nada alterado. Rode com --commit para aplicar.');
    } else {
        writeFileSync(resolve(ROOT, 'recrutadores-rebaixados.json'), JSON.stringify(rows.map((r) => r.Id)));
        const res = await sql`update "Recruiters" r set "Status" = 'discovered' where ${alvo} returning r."Id"`;
        console.log(`✅ ${res.length} voltaram para 'discovered' (backup em recrutadores-rebaixados.json)`);

        // Com a base em ~690 recrutadores BR, a cadência cobre TODOS por semana:
        // 12 runs/dia × 10 = 120/dia, a volta inteira em ~6 dias (o mesmo
        // DIAS_ENTRE_VISITAS). 10 por run = 1 chamada Apify por run, então o teto
        // diário de runs continua significando chamadas. 80 posts por run é o
        // teto de gasto de uma run (US$ 0,16).
        const sch = await sql`
            update "ScraperSchedules" set
                "Params" = "Params" || ${sql.json({ maxRecruiters: 10, maxPosts: 80 })},
                "IntervalMinutes" = 120, "UpdatedAt" = now()
            where "Name" = 'Monitorar recrutadores salvos' returning "Id"`;
        console.log(`✅ robô de monitoramento: a cada 2 h, 10 recrutadores, até 80 posts (${sch.length} atualizado)`);
    }
} finally {
    await sql.end();
}
