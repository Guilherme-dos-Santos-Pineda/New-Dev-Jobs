import 'dotenv/config';
import postgres from 'postgres';

// =========================
// Cliente Postgres (Supabase) — substitui o better-sqlite3
// Uso: import sql from '../lib/sql.js';  const rows = await sql`select ...`;
// =========================

const url = process.env.DATABASE_URL;

if (!url) {
    console.warn('⚠️  DATABASE_URL não definido — configure o Supabase (veja SETUP_SUPABASE.md)');
}

// prepare:false é seguro com o pooler (PgBouncer transaction mode) do Supabase.
// ssl:'require' porque o Supabase exige TLS.
const sql = url
    ? postgres(url, {
        ssl: 'require',
        prepare: false,
        max: Number(process.env.PG_POOL_MAX) || 10,
        transform: { undefined: null },
    })
    : null;

export default sql;
