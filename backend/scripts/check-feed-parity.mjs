#!/usr/bin/env node
// Confere que o pré-filtro em SQL de getMatches() não esconde nenhuma vaga que o
// filtro autoritativo em JS (passesFilters, varrendo a tabela inteira) aprovaria.
//
//   node backend/scripts/check-feed-parity.mjs
//
// Rode SEMPRE que mexer em passesFilters, em classify.js ou na consulta de
// buscarCandidatas. É o único jeito de pegar a falha desta arquitetura, que é
// silenciosa: o SQL fica um pouco mais restritivo que o JS e vaga boa some do
// feed sem erro, sem log e sem ninguém perceber.
//
// "perdidas" só é aceitável quando o teto de MATCHES_MAX linhas entra em ação.
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '.');
dotenv.config({ path: resolve(ROOT, '../../.env') });
const { default: sql } = await import('../lib/sql.js');
const { getMatches, invalidateMatches, passesFilters } = await import('../services/jobsQuery.js');

const todas = await sql`select * from "Jobs" order by "CreatedAt" desc, "Id" desc`;
console.log(`base: ${todas.length} vagas\n`);
const users = await sql`select u."Id", u."Email" from "Users" u join "Profiles" p on p."UserId"=u."Id"`;

let falhas = 0;
for (const u of users) {
    const [profile] = await sql`select * from "Profiles" where "UserId"=${u.Id}`;
    const aplicadas = new Set((await sql`select "JobId" from "Applications" where "UserId"=${u.Id}`).map(r=>String(r.JobId)));
    // Referencia: caminho ANTIGO (varredura completa em JS)
    const ref = new Set(todas
        .filter(j => j.Email && !aplicadas.has(String(j.Id)))
        .filter(j => passesFilters(j, profile))
        .map(j => String(j.Id)));

    invalidateMatches(u.Id);
    const novo = new Set((await getMatches(u.Id)).map(m => String(m.id)));

    const perdidas = [...ref].filter(id => !novo.has(id));
    const extras   = [...novo].filter(id => !ref.has(id));
    const capado   = ref.size > 1500;
    const ok = extras.length === 0 && (perdidas.length === 0 || capado);
    if (!ok) falhas++;
    console.log(`${ok?'✅':'❌'} ${u.Email.slice(0,28).padEnd(28)} antigo=${String(ref.size).padStart(4)} novo=${String(novo.size).padStart(4)} perdidas=${perdidas.length} extras=${extras.length}${capado?' (teto de 1500)':''}`);
    if (extras.length) console.log('   extras (novo trouxe o que o JS barra):', extras.slice(0,5));
    if (perdidas.length && !capado) console.log('   PERDIDAS:', perdidas.slice(0,5));
}
console.log(falhas ? `\n❌ ${falhas} divergencia(s)` : '\n✅ paridade total');
await sql.end();
