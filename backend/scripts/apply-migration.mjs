import 'dotenv/config';
import fs from 'fs';
import sql from '../lib/sql.js';

// =========================================================================
// Aplica um arquivo de migration .sql no banco (usa DATABASE_URL do .env).
// As migrations do projeto são aditivas/idempotentes (add column if not exists,
// create index if not exists), então rodar de novo é seguro.
//
// Uso:  node backend/scripts/apply-migration.mjs supabase/migrations/0007_recruiter_monitoring.sql
// =========================================================================

const file = process.argv[2];
if (!file) {
    console.error('Uso: node backend/scripts/apply-migration.mjs <caminho/arquivo.sql>');
    process.exit(1);
}
if (!sql) { console.error('DATABASE_URL ausente no .env'); process.exit(1); }

try {
    const content = fs.readFileSync(file, 'utf8');
    await sql.unsafe(content); // múltiplos statements (simple query protocol)
    console.log(`✅ Migration aplicada: ${file}`);
    await sql.end();
} catch (e) {
    console.error(`❌ Falha ao aplicar ${file}:`, e.message);
    process.exit(2);
}
