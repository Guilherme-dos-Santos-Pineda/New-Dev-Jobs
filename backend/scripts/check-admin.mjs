#!/usr/bin/env node
// Bate em TODOS os endpoints de leitura do admin, em produção, com uma conta
// admin temporária (criada e apagada aqui, inclusive se der erro no meio).
//
//   npm run check:admin
//
// Nasceu de /admin/overview e /dashboard dando 500 por um import faltando: a
// tela do admin abria em branco e nada no CI acusava. Também mostra o tempo de
// cada um, que foi como apareceram os 13 s de /admin/recruiters.
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env') });
const { default: sql } = await import('../lib/sql.js');
const SB = process.env.SUPABASE_URL;
const ch = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
const SERVICE = ch(process.env.SUPABASE_SERVICE_ROLE_KEY), ANON = ch(process.env.SUPABASE_ANON_KEY);
const API = process.env.API || 'https://newdevjobs.xyz';
const email = `smoke-admin-${Date.now()}@teste.newdevjobs.xyz`, pw = 'Smoke!' + Math.random().toString(36).slice(2);
let id; let falhas = 0;
try {
  let r = await fetch(`${SB}/auth/v1/admin/users`, { method: 'POST', headers: SERVICE, body: JSON.stringify({ email, password: pw, email_confirm: true }) });
  id = (await r.json()).id;
  r = await fetch(`${SB}/auth/v1/token?grant_type=password`, { method: 'POST', headers: ANON, body: JSON.stringify({ email, password: pw }) });
  const tok = (await r.json()).access_token;
  const H = { Authorization: `Bearer ${tok}` };
  await fetch(`${API}/api/auth/me`, { headers: H });
  await sql`update "Users" set "Role"='admin' where "Id"=${id}`;
  const [u] = await sql`select "Id" from "Users" order by "CreatedAt" asc limit 1`;
  const paths = ['/admin/overview','/admin/users','/admin/users/'+u.Id,'/admin/users/'+u.Id+'/feed','/admin/sources','/admin/recruiters','/admin/recruiters/stats','/admin/scraper/runs','/admin/schedules','/admin/jobs','/admin/raw','/admin/ai-stats','/admin/profile-backups','/admin/report','/admin/campaigns','/bugs','/highlights?post=1'];
  for (const p of paths) {
    const t = Date.now();
    const res = await fetch(`${API}/api${p}`, { headers: H });
    const txt = await res.text();
    if (!res.ok) falhas += 1;
    console.log(res.status, String(Date.now()-t).padStart(5)+'ms', p, res.ok ? txt.length+'B' : txt.slice(0,300));
  }
} catch (e) { console.error('ERRO', e); falhas += 1; }
finally {
  if (id) { try { await sql`delete from "Profiles" where "UserId"=${id}`; } catch {} try { await sql`delete from "Users" where "Id"=${id}`; } catch {} await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: SERVICE }); }
  await sql.end();
  console.log(falhas ? `\n❌ ${falhas} endpoint(s) com erro` : '\n✅ todos os endpoints do admin responderam');
  process.exitCode = falhas ? 1 : 0;
}
