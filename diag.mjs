import 'dotenv/config';
import sql from './backend/lib/sql.js';

const p = (t, v) => console.log(`${t.padEnd(34)} ${v}`);
console.log('\n===== VAGAS NA BASE =====');
const [j] = await sql`select count(*)::int as total,
  count(*) filter (where "Email" is not null and "Email" like '%@%.%')::int as com_email,
  count(*) filter (where "CreatedAt" > now() - interval '7 days')::int as ultimos7,
  count(*) filter (where "CreatedAt" > now() - interval '1 day')::int as ontem,
  max("CreatedAt") as mais_nova from "Jobs"`;
p('total', j.total); p('com email valido', j.com_email);
p('criadas nos ultimos 7 dias', j.ultimos7); p('criadas nas ultimas 24h', j.ontem);
p('vaga mais nova', j.mais_nova);

console.log('\n===== POR AREA (com email) =====');
const areas = await sql`select coalesce("Area",'(null)') as area, count(*)::int as n
  from "Jobs" where "Email" like '%@%.%' group by 1 order by 2 desc`;
for (const a of areas) p('  ' + a.area, a.n);

console.log('\n===== SCRAPER =====');
const runs = await sql`select "Status", count(*)::int as n, max("CreatedAt") as ultima
  from "ScraperRuns" where "CreatedAt" > now() - interval '7 days' group by 1 order by 2 desc`;
if (!runs.length) p('execucoes em 7 dias', '0 (nenhuma)');
for (const r of runs) p('  ' + r.Status, `${r.n}  ultima: ${r.ultima?.toISOString?.().slice(0,16)}`);
const [ult] = await sql`select "Status", "Error", "CreatedAt" from "ScraperRuns" order by "CreatedAt" desc limit 1`;
if (ult) p('ultimo erro', (ult.Error || '(sem erro)').slice(0, 90));

console.log('\n===== FILA DE ENVIO =====');
const q = await sql`select "Status", count(*)::int as n from "SendQueue" group by 1`;
if (!q.length) p('fila', 'vazia');
for (const x of q) p('  ' + x.Status, x.n);
const presos = await sql`select count(*)::int as n from "SendQueue" where "Status" = 'queued' and "CreatedAt" < now() - interval '2 hours'`;
p('queued ha mais de 2h (presos?)', presos[0].n);

console.log('\n===== KLEBER =====');
const ks = await sql`select u."Id", u."Email", u."Plan", u."GoogleConnected",
    p."Areas", p."Skills", p."Seniority", p."Modality", p."RequiredKeywords", p."BlockedKeywords", p."CvPath"
  from "Users" u left join "Profiles" p on p."UserId"=u."Id"
  where u."Email" ilike '%kleber%' or u."Name" ilike '%kleber%'`;
if (!ks.length) console.log('  nenhuma conta com "kleber" no email/nome');
for (const k of ks) {
    p('id', k.Id); p('email', k.Email); p('plano', k.Plan); p('google', k.GoogleConnected);
    p('areas', JSON.stringify(k.Areas)); p('skills', JSON.stringify(k.Skills));
    p('senioridade', JSON.stringify(k.Seniority)); p('modalidade', JSON.stringify(k.Modality));
    p('palavras exigidas', JSON.stringify(k.RequiredKeywords));
    p('palavras bloqueadas', JSON.stringify(k.BlockedKeywords));
    p('curriculo', k.CvPath ? 'sim' : 'NAO');
}
await sql.end();
