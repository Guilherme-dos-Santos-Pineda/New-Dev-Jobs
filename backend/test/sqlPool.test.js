import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toTransactionPooler } from '../lib/sql.js';

// ---------- Derivação da URL do pooler (session 5432 → transaction 6543) ----------
// Regressão: rodávamos as queries da app no pooler em SESSION mode, que limita
// ~15 conexões no total do projeto. Com API + worker + cron passávamos disso e a
// app caía sob carga. As queries agora vão no TRANSACTION mode (6543).

const SESSION = 'postgresql://postgres.abc:senha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';

test('toTransactionPooler: pooler do Supabase 5432 vira 6543', () => {
    const out = new URL(toTransactionPooler(SESSION));
    assert.equal(out.port, '6543');
    assert.equal(out.hostname, 'aws-1-sa-east-1.pooler.supabase.com');
});

test('toTransactionPooler: preserva usuário, senha e database', () => {
    const out = new URL(toTransactionPooler(SESSION));
    assert.equal(out.username, 'postgres.abc');
    assert.equal(out.password, 'senha');
    assert.equal(out.pathname, '/postgres');
});

test('toTransactionPooler: senha com caractere escapado (%40) sobrevive', () => {
    const url = 'postgresql://postgres.abc:se%40nha@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';
    const out = new URL(toTransactionPooler(url));
    assert.equal(out.port, '6543');
    assert.equal(out.password, 'se%40nha'); // continua escapado, não vira "@" solto
});

test('toTransactionPooler: já em 6543 fica intacto (idempotente)', () => {
    const url = SESSION.replace(':5432', ':6543');
    assert.equal(new URL(toTransactionPooler(url)).port, '6543');
});

test('toTransactionPooler: host não-Supabase não é reescrito', () => {
    // Banco local/próprio não tem pooler — mexer na porta quebraria a conexão.
    const local = 'postgresql://user:pw@localhost:5432/postgres';
    assert.equal(toTransactionPooler(local), local);
});

test('toTransactionPooler: conexão direta do Supabase não é reescrita', () => {
    // db.<ref> não é o pooler; só o host *.pooler.supabase.com aceita 6543.
    const direct = 'postgresql://postgres:pw@db.abc.supabase.co:5432/postgres';
    assert.equal(toTransactionPooler(direct), direct);
});

test('toTransactionPooler: valores vazios/malformados passam sem lançar', () => {
    assert.equal(toTransactionPooler(undefined), undefined);
    assert.equal(toTransactionPooler(''), '');
    assert.equal(toTransactionPooler('não-é-url'), 'não-é-url');
});

// ---------- Tamanho do pool x paralelismo do dashboard ----------
// Regressão: o pool era 10 e UM único GET /api/dashboard dispara 10 queries em
// paralelo (7 no Promise.all + 1 do planUsage + 2 do getMatches). A requisição
// saturava o pool sozinha, e qualquer segunda coisa — recarregar a aba, abrir
// outra tela, o worker consumindo a fila — ficava na fila atrás dela. Como a
// query do getMatches segura uma conexão por ~1,2s, o dashboard parecia travar.
//
// O teto de ~15 conexões é do SESSION mode (só o pg-boss, com 2). Em transaction
// mode a conexão volta ao pool a cada transação, então aumentar é seguro.

test('pool das queries da app comporta o paralelismo do dashboard', async () => {
    const { default: sql } = await import('../lib/sql.js');
    // Sem DATABASE_URL no ambiente de teste o cliente é null; a checagem abaixo
    // é sobre o DEFAULT do código, não sobre a conexão.
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../lib/sql.js', import.meta.url), 'utf8');
    const m = src.match(/PG_POOL_MAX\)\s*\|\|\s*(\d+)/);
    assert.ok(m, 'não achei o default de PG_POOL_MAX');
    const teto = Number(m[1]);
    const QUERIES_DO_DASHBOARD = 10;
    assert.ok(teto > QUERIES_DO_DASHBOARD,
        `pool ${teto} não pode ser <= às ${QUERIES_DO_DASHBOARD} queries paralelas do dashboard`);
    assert.equal(sql, sql); // o import não pode explodir
});
