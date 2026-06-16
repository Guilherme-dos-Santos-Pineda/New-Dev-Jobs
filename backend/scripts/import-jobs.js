import 'dotenv/config';
import fs from 'fs';
import sql from '../lib/sql.js';
import { jobHash, extractSkills } from '../services/scraper.js';
import { detectLevel } from '../services/jobsQuery.js';

// =========================================================================
// Importador de vagas/recrutadores a partir de um arquivo JSON exportado.
// Semeia o banco SEM Apify e SEM IA (o dado já vem estruturado).
//
// Uso:
//   node backend/scripts/import-jobs.js <arquivo.json> [--dry] [--limit=N] [--status=approved]
//
//   --dry         só conta o que faria, não escreve no banco
//   --limit=N     processa no máximo N registros (bom p/ um teste rápido)
//   --status=...  status dos recrutadores criados (default: discovered)
//
// Cada registro vira:
//   • uma Job (Company, JobTitle, Email, PostedAt=sent_at, skills do título) — dedup por JobHash
//   • um Recruiter/contato chaveado por email (Source='import') — vínculo Job→Recruiter
// =========================================================================

const EMAIL_RE = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dry = args.includes('--dry');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const statusArg = args.find((a) => a.startsWith('--status='));
const recStatus = statusArg ? statusArg.split('=')[1] : 'discovered';

if (!file) {
    console.error('Uso: node backend/scripts/import-jobs.js <arquivo.json> [--dry] [--limit=N] [--status=approved]');
    process.exit(1);
}

// Acha recursivamente o primeiro array cujos elementos parecem registros de vaga
// (têm recipient_email / job_title / company_name) — robusto ao "wrapper" do export.
function findRecords(node, depth = 0) {
    if (depth > 8 || node == null) return null;
    if (Array.isArray(node)) {
        const looksRight = node.some((el) => el && typeof el === 'object'
            && ('recipient_email' in el || 'job_title' in el || 'company_name' in el));
        if (looksRight) return node;
        for (const el of node) { const r = findRecords(el, depth + 1); if (r) return r; }
        return null;
    }
    if (typeof node === 'object') {
        for (const v of Object.values(node)) { const r = findRecords(v, depth + 1); if (r) return r; }
    }
    return null;
}

const stats = { total: 0, jobsNew: 0, jobsDup: 0, recruitersNew: 0, skippedNoEmail: 0, skippedNoTitle: 0, badEmail: 0 };
const recruiterCache = new Map(); // emailLower -> recruiterId (evita lookups repetidos)

async function recruiterIdByEmail(email, company) {
    const key = email.toLowerCase();
    if (recruiterCache.has(key)) return recruiterCache.get(key);
    const [existing] = await sql`select "Id" from "Recruiters" where lower("Email") = ${key} limit 1`;
    let id = existing?.Id;
    if (!id) {
        const [row] = await sql`
            insert into "Recruiters" ("Email", "Company", "Source", "Status")
            values (${email}, ${company || null}, 'import', ${recStatus})
            returning "Id"`;
        id = row.Id;
        stats.recruitersNew += 1;
    }
    recruiterCache.set(key, id);
    return id;
}

async function importRecord(rec) {
    const company = (rec.company_name || '').trim() || null;
    const title = (rec.job_title || '').trim();
    const email = (rec.recipient_email || '').trim();
    const postedAt = rec.sent_at ? new Date(rec.sent_at) : null;

    if (!title) { stats.skippedNoTitle += 1; return; }
    if (!email) { stats.skippedNoEmail += 1; return; }
    if (!EMAIL_RE.test(email)) { stats.badEmail += 1; return; }

    if (dry) { stats.jobsNew += 1; return; } // no modo dry só estima

    const recId = await recruiterIdByEmail(email, company);
    const hash = jobHash(company, title, email);
    const skills = extractSkills(title);
    const seniority = detectLevel(title);
    const res = await sql`
        insert into "Jobs" ("Company", "JobTitle", "Email", "Skills", "Description", "JobHash", "PostedAt", "RecruiterId", "AiClassification", "Seniority")
        values (${company}, ${title}, ${email}, ${sql.json(skills)}, ${null}, ${hash}, ${postedAt && !isNaN(postedAt) ? postedAt : null}, ${recId}, 'import', ${seniority})
        on conflict do nothing
        returning "Id"`;
    if (res.length) stats.jobsNew += 1; else stats.jobsDup += 1;
}

(async () => {
    console.log(`📥 Importando de ${file}${dry ? ' (DRY RUN)' : ''}…`);
    const raw = fs.readFileSync(file, 'utf8');
    const json = JSON.parse(raw);
    const records = findRecords(json);
    if (!records) { console.error('❌ Não encontrei o array de registros no JSON.'); process.exit(1); }

    console.log(`🔎 ${records.length} registros encontrados.`);
    for (const rec of records) {
        if (stats.total >= limit) break;
        stats.total += 1;
        try { await importRecord(rec); }
        catch (e) { console.warn(`  ! registro ${stats.total} falhou: ${e.message}`); }
        if (stats.total % 200 === 0) console.log(`  …${stats.total} processados (vagas novas: ${stats.jobsNew}, dup: ${stats.jobsDup})`);
    }

    console.log('✅ Concluído:', JSON.stringify(stats, null, 2));
    process.exit(0);
})().catch((e) => { console.error('❌ Importação falhou:', e); process.exit(1); });
