import crypto from 'crypto';
import { ApifyClient } from 'apify-client';
import sql from '../lib/sql.js';
import { config } from '../config.js';

// =========================
// Scraper DevScout (Apify) — escreve no Postgres
// =========================
// Fase 1 (discovery): LinkedIn Profile Search Scraper → base própria "Recruiters".
// Fase 2 (monitoring): LinkedIn Post Search Scraper nos recrutadores aprovados,
//   queries ENTRE ASPAS (busca mais precisa), extrai vagas com email → "Jobs".
// Anti-duplicação: Jobs."LinkedinId" (post id) único + Jobs."JobHash" (empresa+cargo+email).

const knownSkills = [
    '.NET', 'C#', 'ASP.NET', 'Node.js', 'JavaScript', 'TypeScript', 'React', 'Angular', 'Vue',
    'Java', 'Spring', 'Python', 'PHP', 'Laravel', 'MySQL', 'PostgreSQL', 'SQL Server', 'MongoDB',
    'Redis', 'Docker', 'Kubernetes', 'AWS', 'Azure', 'GCP', 'RabbitMQ', 'Kafka', 'Git', 'OAuth',
    'JWT', 'REST', 'SOAP', 'Swagger', 'OpenAPI', 'Go', 'Rust', 'Ruby', 'Rails', 'Flutter', 'Kotlin', 'Swift',
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function apifyClient() {
    if (!config.apify.token) throw new Error('APIFY_TOKEN não configurado (veja .env)');
    return new ApifyClient({ token: config.apify.token });
}

// Hash de dedup de vaga: empresa|cargo|email (normalizado).
export function jobHash(company, title, email) {
    const norm = (s) => String(s || '').trim().toLowerCase();
    return crypto.createHash('sha1').update(`${norm(company)}|${norm(title)}|${norm(email)}`).digest('hex');
}

const extractEmail = (text) => (text.match(EMAIL_RE) || [])[0] || '';
const extractTitle = (text) => (
    text.match(/Assunto do e-?mail:\s*(.+)/i)?.[1]?.trim()
    || text.match(/Vaga:\s*(.+)/i)?.[1]?.trim()
    || text.match(/Cargo:\s*(.+)/i)?.[1]?.trim()
    || ''
);
const extractSkills = (text) => {
    const low = (text || '').toLowerCase();
    return knownSkills.filter((s) => low.includes(s.toLowerCase()));
};

// Normaliza URL de perfil do LinkedIn (sem querystring/barra final) para casar recrutadores.
function cleanLinkedinUrl(url) {
    try {
        const u = new URL(url);
        return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
    } catch {
        return (url || '').split('?')[0].replace(/\/+$/, '');
    }
}

async function setRunStats(runId, stats) {
    if (runId) await sql`update "ScraperRuns" set "Stats" = ${sql.json(stats)} where "Id" = ${runId}`;
}

// =========================
// FASE 1 — Descoberta de recrutadores
// =========================
export async function runDiscovery({ queries, location = 'Brazil', maxResults = 5, runId } = {}) {
    if (!config.apify.profileActorId) throw new Error('APIFY_PROFILE_ACTOR_ID não configurado (actor de perfis)');
    const searchQueries = (queries && queries.length ? queries : ['Tech Recruiter', 'Talent Acquisition']);
    const client = apifyClient();

    // Campos defensivos: o schema exato varia conforme o actor; mandamos aliases comuns.
    const input = {
        searchQueries, queries: searchQueries,
        location, locations: [location],
        maxResults, maxItems: maxResults,
        profileScraperMode: 'full',
    };

    const run = await client.actor(config.apify.profileActorId).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    let upserted = 0, withEmail = 0;
    for (const it of items) {
        const url = cleanLinkedinUrl(it.linkedinUrl || it.profileUrl || it.url || it.publicProfileUrl || '');
        if (!url) continue;
        const name = it.name || it.fullName || [it.firstName, it.lastName].filter(Boolean).join(' ').trim() || null;
        const email = it.email || it.emailAddress || (Array.isArray(it.emails) ? it.emails[0] : '') || null;
        const title = it.headline || it.occupation || it.title || it.position || null;
        const company = it.companyName || it.company || it.currentCompany?.name || null;
        const linkedinId = it.publicIdentifier || it.universalName || null;
        if (email) withEmail++;
        await sql`
            insert into "Recruiters" ("LinkedinUrl", "LinkedinId", "Name", "Email", "Title", "Company", "Status")
            values (${url}, ${linkedinId}, ${name}, ${email}, ${title}, ${company}, 'discovered')
            on conflict ("LinkedinUrl") do update set
                "LinkedinId" = coalesce(excluded."LinkedinId", "Recruiters"."LinkedinId"),
                "Name"       = coalesce(excluded."Name",       "Recruiters"."Name"),
                "Email"      = coalesce(excluded."Email",      "Recruiters"."Email"),
                "Title"      = coalesce(excluded."Title",      "Recruiters"."Title"),
                "Company"    = coalesce(excluded."Company",    "Recruiters"."Company"),
                "UpdatedAt"  = now()`;
        upserted++;
    }

    const stats = { found: items.length, upserted, withEmail };
    await setRunStats(runId, stats);
    return stats;
}

// =========================
// FASE 2 — Monitoramento de recrutadores aprovados
// =========================
export async function runMonitoring({ queries, maxPosts = 10, runId } = {}) {
    // Queries entre aspas → o Post Search Scraper trata como frase (busca mais precisa).
    const searchQueries = (queries && queries.length ? queries : ['"hiring software engineer"', '"hiring backend developer"']);

    // Recrutadores aprovados; fallback p/ RecruiterSources ativas (retrocompat).
    let authorUrls = (await sql`select "LinkedinUrl" from "Recruiters" where "Status" = 'approved'`).map((r) => r.LinkedinUrl);
    if (!authorUrls.length) {
        authorUrls = (await sql`select "Url" from "RecruiterSources" where "Active" = true`).map((r) => r.Url);
    }

    const client = apifyClient();
    const input = {
        searchQueries,
        maxPosts,
        profileScraperMode: 'short',
        startPage: 1,
        scrapeReactions: false,
        scrapeComments: false,
        ...(authorUrls.length ? { authorUrls } : {}),
    };

    const run = await client.actor(config.apify.postActorId).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    let inserted = 0, withEmail = 0, skipped = 0;
    for (const item of items) {
        const content = item.content || '';
        const email = extractEmail(content);
        if (!email) { skipped++; continue; } // sem email a vaga não é acionável
        withEmail++;

        const title = extractTitle(content) || 'Vaga';
        const company = (item.author?.type === 'company' ? item.author?.name : item.author?.companyName) || item.author?.name || '';
        const skills = extractSkills(content);
        const hash = jobHash(company, title, email);
        const postedAt = item.postedAt?.date ? new Date(item.postedAt.date) : null;
        const authorUrl = cleanLinkedinUrl(item.author?.linkedinUrl || '');

        const [rec] = authorUrl
            ? await sql`select "Id" from "Recruiters" where "LinkedinUrl" = ${authorUrl} limit 1`
            : [];
        const recId = rec?.Id || null;

        const res = await sql`
            insert into "Jobs" ("Company", "JobTitle", "Email", "Skills", "Description", "LinkedinId", "JobHash", "PostedAt", "RecruiterId")
            values (${company}, ${title}, ${email}, ${sql.json(skills)}, ${content}, ${String(item.id)}, ${hash}, ${postedAt}, ${recId})
            on conflict do nothing
            returning "Id"`;
        if (res.length) inserted++;

        if (recId && postedAt) {
            await sql`update "Recruiters" set "LastPostDate" = greatest(coalesce("LastPostDate", to_timestamp(0)), ${postedAt}), "UpdatedAt" = now() where "Id" = ${recId}`;
        }
    }

    const stats = { posts: items.length, withEmail, inserted, skipped, recruiters: authorUrls.length };
    await setRunStats(runId, stats);
    return stats;
}
