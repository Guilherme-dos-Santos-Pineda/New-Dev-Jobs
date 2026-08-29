#!/usr/bin/env node
// Mede quantos usuários DISTINTOS conseguem carregar o dashboard ao mesmo tempo.
//
//   node backend/scripts/load-test.mjs [maxSimultaneos]
//
// Usuários distintos de propósito: o memo de getMatches é POR USUÁRIO, então
// repetir o mesmo usuário mediria o cache, não o sistema. Cria os usuários de
// teste, mede, e APAGA todos no final (inclusive se der erro no meio).
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

const { default: sql } = await import('../lib/sql.js');

// A API de Auth do Supabase e chamada por HTTP direto, sem o supabase-js: o SDK
// instancia um cliente de realtime que exige WebSocket nativo (Node >= 22), e
// isto aqui e um script de carga, nao um cliente de tempo real.
const SB = process.env.SUPABASE_URL;
const chaves = (k) => ({ apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' });
const SERVICE = chaves(process.env.SUPABASE_SERVICE_ROLE_KEY);
const ANON = chaves(process.env.SUPABASE_ANON_KEY);

async function criarUsuario(email, password) {
    const r = await fetch(`${SB}/auth/v1/admin/users`, {
        method: 'POST', headers: SERVICE,
        body: JSON.stringify({ email, password, email_confirm: true }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`criar usuario: ${j.msg || j.message || r.status}`);
    return j.id;
}
async function apagarUsuario(id) {
    await fetch(`${SB}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: SERVICE });
}
async function entrar(email, password) {
    const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: ANON, body: JSON.stringify({ email, password }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`login: ${j.msg || j.error_description || r.status}`);
    return j.access_token;
}

const API = process.env.LOAD_TEST_API || 'https://newdevjobs.xyz';
const MAX = Number(process.argv[2]) || 16;
const SENHA = 'CargaTeste!' + Math.random().toString(36).slice(2, 10);

const criados = [];
async function limpar() {
    for (const u of criados) {
        try { await sql`delete from "Profiles" where "UserId" = ${u.id}`; } catch {}
        try { await sql`delete from "Users" where "Id" = ${u.id}`; } catch {}
        try { await apagarUsuario(u.id); } catch {}
    }
    console.log(`  ${criados.length} usuários de teste removidos`);
}
process.on('SIGINT', async () => { await limpar(); process.exit(1); });

try {
    console.log(`alvo: ${API} · até ${MAX} simultâneos`);
    const antes = (await sql`select count(*)::int n from "Users"`)[0].n;

    for (let i = 0; i < MAX; i++) {
        const email = `carga-${Date.now()}-${i}@teste-newdevjobs.local`;
        const id = await criarUsuario(email, SENHA);
        criados.push({ id, email });
        await sql`insert into "Users" ("Id","Name","Email") values (${id}, 'Carga', ${email}) on conflict do nothing`;
        // Perfis variados: um só perfil mediria um só caminho da consulta.
        const areas = [[], ['dev'], ['dev', 'mobile'], ['data']][i % 4];
        const mods = [['remoto'], ['remoto', 'hibrido'], [], ['remoto', 'hibrido', 'presencial']][i % 4];
        await sql`
            insert into "Profiles" ("UserId","Skills","Areas","Modalities","Levels","Region")
            values (${id}, ${sql.json(['javascript', 'react', 'node', 'sql'])}, ${sql.json(areas)}, ${sql.json(mods)}, ${sql.json(['pleno'])}, 'br')`;
    }
    console.log(`  ${criados.length} usuários de teste criados`);

    const tokens = [];
    for (const u of criados) tokens.push(await entrar(u.email, SENHA));

    const carregar = async (token) => {
        const t0 = Date.now();
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 30000);
        try {
            const r = await fetch(`${API}/api/dashboard`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
            const body = await r.text();
            return { ok: r.status === 200, ms: Date.now() - t0, status: r.status, bytes: body.length };
        } catch { return { ok: false, ms: Date.now() - t0, status: 'timeout', bytes: 0 };
        } finally { clearTimeout(timer); }
    };

    console.log('\n=== RAMPA: N usuários DISTINTOS carregando o dashboard ao mesmo tempo ===');
    for (const n of [1, 2, 4, 8, 16].filter((x) => x <= MAX)) {
        const t0 = Date.now();
        const rs = await Promise.all(tokens.slice(0, n).map(carregar));
        const ok = rs.filter((r) => r.ok);
        const ms = rs.map((r) => r.ms).sort((a, b) => a - b);
        const kb = ok.length ? Math.round(ok.reduce((s, r) => s + r.bytes, 0) / ok.length / 1024) : 0;
        console.log(`  ${String(n).padStart(2)} simultâneos: ${ok.length}/${n} ok · mediana ${String(ms[Math.floor(ms.length / 2)]).padStart(6)}ms · pior ${String(ms[ms.length - 1]).padStart(6)}ms · ${kb} kB/resposta`);
        const ruins = rs.filter((r) => !r.ok);
        if (ruins.length) console.log(`     ⚠️  ${ruins.length} falharam (${ruins.map((r) => r.status).join(',')})`);
    }

    const depois = (await sql`select count(*)::int n from "Users"`)[0].n;
    console.log(`\nUsers: ${antes} antes → ${depois} durante (${depois - antes} de teste)`);
} finally {
    console.log('\n=== limpando ===');
    await limpar();
    const [{ n }] = await sql`select count(*)::int n from "Users"`;
    console.log(`  Users agora: ${n}`);
    await sql.end();
}
