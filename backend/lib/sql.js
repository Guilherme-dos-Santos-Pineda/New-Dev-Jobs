import 'dotenv/config';
import postgres from 'postgres';

// =========================
// Cliente Postgres (Supabase) — substitui o better-sqlite3
// Uso: import sql from '../lib/sql.js';  const rows = await sql`select ...`;
// =========================

if (!process.env.DATABASE_URL) {
    console.warn('⚠️  DATABASE_URL não definido — configure o Supabase (veja SETUP_SUPABASE.md)');
}

// =========================
// Session mode (5432) x Transaction mode (6543) — por que isto importa
// =========================
// O pooler do Supabase em SESSION mode (5432) limita ~15 conexões no TOTAL do
// projeto. Somando API + worker (+ cron) passávamos disso e a app derrubava sob
// carga ("remaining connection slots"), principalmente durante deploys, quando o
// processo velho e o novo coexistem.
//
// TRANSACTION mode (6543) devolve a conexão ao pool a cada transação e suporta
// milhares de clientes — é o modo certo para queries da aplicação. O requisito
// dele é `prepare:false` (sem prepared statements), que já usávamos.
//
// Só o pg-boss (lib/boss.js) continua em session mode: ele depende de recursos
// de sessão (advisory locks / LISTEN-NOTIFY) que o transaction mode não mantém.
//
// Derivamos a URL automaticamente (5432 → 6543) para não exigir env nova; defina
// DATABASE_POOL_URL se precisar apontar para outro host/porta explicitamente.
export function toTransactionPooler(raw) {
    if (!raw) return raw;
    try {
        const u = new URL(raw);
        // Só reescreve o pooler do Supabase; conexão direta/local fica como está.
        if (u.hostname.includes('pooler.supabase.com') && u.port === '5432') {
            u.port = '6543';
            return u.toString();
        }
    } catch {
        // URL malformada → devolve original e deixa o driver reclamar.
    }
    return raw;
}

const url = process.env.DATABASE_POOL_URL || toTransactionPooler(process.env.DATABASE_URL);

const sql = url
    ? postgres(url, {
        ssl: 'require',        // Supabase exige TLS
        prepare: false,        // obrigatório no transaction mode (PgBouncer)
        // Em transaction mode as conexões são recicladas por transação, então um
        // pool maior escala sem estourar o limite do projeto.
        max: Number(process.env.PG_POOL_MAX) || 10,
        idle_timeout: 20,      // devolve conexão ociosa ao pooler (segundos)
        connect_timeout: 10,   // falha rápido em vez de pendurar a request
        transform: { undefined: null },
    })
    : null;

export default sql;
