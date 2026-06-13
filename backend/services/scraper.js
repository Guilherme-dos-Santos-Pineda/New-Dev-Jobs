import crypto from 'crypto';
import { ApifyClient } from 'apify-client';
import sql from '../lib/sql.js';
import { config } from '../config.js';
import { analyzeContent } from './ai.js';

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
    const titles = (queries && queries.length ? queries : ['Tech Recruiter', 'Talent Acquisition']);
    const client = apifyClient();

    // Input do actor harvestapi/linkedin-profile-search:
    // searchQuery (string), currentJobTitles (array), maxItems, locations, profileScraperMode.
    // "Full + email search" é o modo que retorna email.
    const input = {
        searchQuery: titles[0],
        currentJobTitles: titles,
        maxItems: maxResults,
        profileScraperMode: 'Full + email search',
        ...(location ? { locations: [location] } : {}),
    };

    const run = await client.actor(config.apify.profileActorId).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    let upserted = 0, withEmail = 0;
    for (const it of items) {
        const url = cleanLinkedinUrl(it.linkedinUrl || it.profileUrl || it.url || it.publicProfileUrl || '');
        if (!url) continue;
        const name = it.name || it.fullName || [it.firstName, it.lastName].filter(Boolean).join(' ').trim() || null;
        // emails pode ser array de objetos [{email,status}], array de strings, ou string
        const emailsArr = Array.isArray(it.emails) ? it.emails : [];
        const emailFromArr = emailsArr.map((e) => (typeof e === 'string' ? e : e?.email)).filter(Boolean)[0];
        const email = it.email || it.emailAddress || emailFromArr || null;
        const title = it.headline || it.occupation || it.title || it.position || null;
        const company = it.companyName || it.company || it.currentPosition?.companyName || it.currentPosition?.company || it.currentCompany?.name || null;
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

    let inserted = 0, withEmail = 0, skipped = 0, aiUsed = 0, aiCalls = 0;
    for (const item of items) {
        const content = item.content || '';
        const postId = String(item.id);
        const authorName = item.author?.name || null;
        const authorUrl = cleanLinkedinUrl(item.author?.linkedinUrl || '');
        const postedAt = item.postedAt?.date ? new Date(item.postedAt.date) : null;

        // Pré-análise com IA (respeita o teto de chamadas por run)
        let ai = null;
        if (aiCalls < config.ai.maxCallsPerRun) {
            aiCalls += 1;
            ai = await analyzeContent(content); // null se IA off / circuito aberto / erro
            if (ai) aiUsed += 1;
        }

        const regexEmail = extractEmail(content);
        const email = ai?.email || regexEmail;

        // Campos da vaga: da IA quando disponível, senão regex (fallback)
        let isJob, confidence, classification, title, company, skills, seniority, modality, location, salary;
        if (ai) {
            isJob = ai.isJob;
            confidence = ai.confidence;
            classification = ai.isJob ? 'job' : ai.isAd ? 'ad' : ai.isGeneric ? 'generic' : ai.isRecruiter ? 'recruiter' : 'other';
            title = ai.cargo || extractTitle(content) || 'Vaga';
            company = ai.empresa || authorName || '';
            skills = ai.tecnologias?.length ? ai.tecnologias : extractSkills(content);
            seniority = ai.senioridade; modality = ai.modalidade; location = ai.localizacao; salary = ai.salario;
        } else {
            isJob = !!regexEmail; // sem IA: heurística antiga (tem email = candidatável)
            confidence = null; classification = 'fallback';
            title = extractTitle(content) || 'Vaga';
            company = (item.author?.type === 'company' ? authorName : item.author?.companyName) || authorName || '';
            skills = extractSkills(content);
            seniority = modality = location = salary = null;
        }

        // Salva o conteúdo bruto sempre (tela "Conteúdo Bruto")
        await sql`
            insert into "ScrapedPosts" ("Source", "Author", "AuthorUrl", "Url", "LinkedinId", "Content", "PostedAt", "AiResult", "Status")
            values ('monitoring', ${authorName}, ${authorUrl || null}, ${item.linkedinUrl || null}, ${postId}, ${content}, ${postedAt}, ${ai ? sql.json(ai) : null}, 'pending')
            on conflict ("LinkedinId") do update set "AiResult" = excluded."AiResult", "PostedAt" = excluded."PostedAt"`;

        // Só vira vaga se: é vaga + tem email + (sem IA OU confiança >= limite)
        const qualifies = isJob && email && (confidence == null || confidence >= config.ai.minConfidence);
        if (!qualifies) { skipped += 1; continue; }
        withEmail += 1;

        const hash = jobHash(company, title, email);
        const [rec] = authorUrl ? await sql`select "Id" from "Recruiters" where "LinkedinUrl" = ${authorUrl} limit 1` : [];
        const recId = rec?.Id || null;

        const res = await sql`
            insert into "Jobs" ("Company", "JobTitle", "Email", "Skills", "Description", "LinkedinId", "JobHash", "PostedAt", "RecruiterId",
                "AiScore", "AiClassification", "Seniority", "Modality", "Location", "Salary")
            values (${company}, ${title}, ${email}, ${sql.json(skills)}, ${content}, ${postId}, ${hash}, ${postedAt}, ${recId},
                ${confidence}, ${classification}, ${seniority}, ${modality}, ${location}, ${salary})
            on conflict do nothing
            returning "Id"`;
        if (res.length) inserted += 1;

        if (recId && postedAt) {
            await sql`update "Recruiters" set "LastPostDate" = greatest(coalesce("LastPostDate", to_timestamp(0)), ${postedAt}), "UpdatedAt" = now() where "Id" = ${recId}`;
        }
    }

    const stats = { posts: items.length, withEmail, inserted, skipped, aiUsed, recruiters: authorUrls.length };
    await setRunStats(runId, stats);
    return stats;
}

// Reprocessa um post bruto com a IA (usado pelo admin "reprocessar IA").
export async function reprocessPost(postId) {
    const [post] = await sql`select * from "ScrapedPosts" where "Id" = ${postId}`;
    if (!post) throw new Error('Post não encontrado');
    const ai = await analyzeContent(post.Content || '');
    await sql`update "ScrapedPosts" set "AiResult" = ${ai ? sql.json(ai) : null} where "Id" = ${postId}`;
    return ai;
}
