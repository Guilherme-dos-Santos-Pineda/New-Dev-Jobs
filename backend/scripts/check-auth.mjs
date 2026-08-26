#!/usr/bin/env node
// Diagnóstico da cadeia de autenticação. Rodar NA VM:
//
//   node /opt/newdevjobs/backend/scripts/check-auth.mjs
//   node /opt/newdevjobs/backend/scripts/check-auth.mjs <access_token>
//
// Existe porque uma falha de login não deixava rastro: o middleware descartava
// o erro do Supabase e devolvia 401 sem log. Aqui cada elo é testado em
// separado, para o sintoma "não consigo entrar" virar uma causa concreta.
//
// NUNCA imprime segredos — só o comprimento e os últimos caracteres, o
// suficiente para comparar com o painel do Supabase sem vazar a chave.
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// O `dotenv/config` padrão procura o .env no diretório ATUAL. Rodando o script
// de qualquer lugar que não /opt/newdevjobs (o WorkingDirectory do systemd), ele
// não acharia nada e reportaria "todas as variáveis ausentes" — um falso
// negativo que faz parecer que a configuração sumiu. Resolvemos pelo caminho do
// próprio arquivo, então funciona de qualquer cwd.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(ROOT, '.env') });

// Import DINÂMICO e depois do dotenv: `import` estático é içado para o topo e
// rodaria antes do carregamento acima, com o process.env ainda vazio.
const { supabaseAdmin, supabaseConfigured } = await import('../lib/supabaseAdmin.js');
const { default: sql } = await import('../lib/sql.js');

console.log(`
0. .env lido de ${resolve(ROOT, '.env')}`);

const ok = (m) => console.log(`  ✅ ${m}`);
const no = (m) => console.log(`  ❌ ${m}`);
const info = (m) => console.log(`     ${m}`);

function fingerprint(v) {
    if (!v) return '(ausente)';
    return `${v.length} chars, termina em …${v.slice(-6)}`;
}

console.log('\n1. Variáveis de ambiente');
const url = process.env.SUPABASE_URL;
const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_ANON_KEY;
url ? ok(`SUPABASE_URL = ${url}`) : no('SUPABASE_URL ausente');
svc ? ok(`SUPABASE_SERVICE_ROLE_KEY: ${fingerprint(svc)}`) : no('SUPABASE_SERVICE_ROLE_KEY ausente');
anon ? ok(`SUPABASE_ANON_KEY: ${fingerprint(anon)}`) : no('SUPABASE_ANON_KEY ausente');

// A anon key do backend tem de ser do MESMO projeto que o frontend usa; se
// divergirem, o token emitido para o usuário não é validável aqui.
try {
    const ref = new URL(url).hostname.split('.')[0];
    info(`project ref = ${ref}  (tem de bater com o sb-<ref>-auth-token do navegador)`);
} catch { /* url inválida já reportada acima */ }

console.log('\n2. Cliente admin');
supabaseConfigured ? ok('supabaseAdmin instanciado') : no('supabaseAdmin NULO — todo login falha com 401');

if (supabaseAdmin) {
    console.log('\n3. A service_role key é válida?');
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) {
        no(`Supabase recusou a service_role key: ${error.message}`);
        info('Chave errada, de outro projeto, ou revogada. Pegue de novo em');
        info('Supabase → Project Settings → API → service_role.');
    } else {
        ok(`service_role aceita (o projeto tem ${data.users.length ? 'usuários' : 'nenhum usuário ainda'})`);
    }
}

console.log('\n4. Banco de dados');
try {
    if (!sql) throw new Error('DATABASE_URL ausente — cliente não instanciado');
    const [row] = await sql`select count(*)::int as n from "Users"`;
    ok(`tabela "Users" acessível — ${row.n} registro(s)`);
} catch (e) {
    no(`falha ao consultar "Users": ${e.message}`);
}

const token = process.argv[2];
if (token && supabaseAdmin) {
    console.log('\n5. O token informado é aceito?');
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error) {
        no(`recusado: ${error.message}`);
        info('"invalid JWT" costuma ser token de outro projeto; "expired", sessão velha.');
    } else {
        ok(`aceito — user ${data.user.id} (${data.user.email})`);
        if (sql) {
            const [row] = await sql`select "Id", "Email" from "Users" where "Id" = ${data.user.id}`;
            row ? ok('usuário existe na tabela "Users"') : info('ainda não existe em "Users" (é criado no 1º /api/auth/me)');
        }
    }
} else if (!token) {
    console.log('\n5. Token: nenhum informado.');
    info('Para testar um token real: no navegador logado, F12 → Application →');
    info('Local Storage → a chave sb-<ref>-auth-token → copie o "access_token"');
    info('e rode:  node backend/scripts/check-auth.mjs "<access_token>"');
}

console.log();
process.exit(0);
