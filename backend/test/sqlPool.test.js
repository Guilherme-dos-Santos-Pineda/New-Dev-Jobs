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
