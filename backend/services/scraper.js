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
export const extractSkills = (text) => {
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

// ---- Heurística de país (o Post Search não tem filtro de país) ----
const BR_HINT = /brasil|brazil|s[ãa]o paulo|\bsp\b|rio de janeiro|belo horizonte|curitiba|porto alegre|bras[íi]lia|fortaleza|recife|salvador|campinas|florian[óo]polis|goi[âa]nia|remoto \(brasil\)/i;
const PT_MARKER = /\b(vaga|vagas|contratando|candidat|curr[íi]culo|sal[áa]rio|requisitos|desenvolvedor|pessoa desenvolvedora|conhecimentos?|experi[êe]ncia|home ?office|h[íi]brido|clt|pj)\b/i;
const COUNTRY_HINTS = {
    india: /\bindia\b|bangalore|bengaluru|hyderabad|mumbai|new delhi|\bdelhi\b|\bpune\b|chennai|noida|gurgaon|gurugram|kolkata|\bncr\b/i,
    usa: /\b(united states|u\.?s\.?a?\.?)\b|new york|san francisco|california|\btexas\b|seattle|boston|chicago/i,
    uk: /\b(united kingdom|u\.?k\.?)\b|london|manchester/i,
    canada: /\bcanada\b|toronto|vancouver|ontario/i,
    portugal: /\bportugal\b|lisboa|lisbon|porto\b/i,
};
function looksBrazil(content, ai, email) {
    const dom = (email || '').split('@')[1]?.toLowerCase() || '';
    if (dom.endsWith('.br')) return true;
    const text = `${content || ''} ${ai?.localizacao || ''}`;
    if (BR_HINT.test(text)) return true;
    if (PT_MARKER.test(text) && /[ãõçáéíóúâêô]/i.test(content || '')) return true; // português com acentos
    return false;
}
function matchesCountry(content, ai, name) {
    const text = `${content || ''} ${ai?.localizacao || ''}`;
    const re = COUNTRY_HINTS[name?.toLowerCase()] || new RegExp(`\\b${(name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return re.test(text);
}

// Deriva os campos da vaga a partir do conteúdo + análise de IA (com fallback regex).
function deriveJobFields(content, ai, item = {}) {
    const authorName = item.author?.name || null;
    const regexEmail = extractEmail(content);
    if (ai) {
        return {
            isJob: ai.isJob,
            confidence: ai.confidence,
            classification: ai.isJob ? 'job' : ai.isAd ? 'ad' : ai.isGeneric ? 'generic' : ai.isRecruiter ? 'recruiter' : 'other',
            title: ai.cargo || extractTitle(content) || 'Vaga',
            company: ai.empresa || authorName || '',
            skills: ai.tecnologias?.length ? ai.tecnologias : extractSkills(content),
            seniority: ai.senioridade, modality: ai.modalidade, location: ai.localizacao, salary: ai.salario,
            email: ai.email || regexEmail,
        };
    }
    return {
        isJob: !!regexEmail, confidence: null, classification: 'fallback',
        title: extractTitle(content) || 'Vaga',
        company: (item.author?.type === 'company' ? authorName : item.author?.companyName) || authorName || '',
        skills: extractSkills(content),
        seniority: null, modality: null, location: null, salary: null,
        email: regexEmail,
    };
}

// Insere a vaga (dedup por LinkedinId + JobHash). Retorna 'new' | 'duplicate'.
async function insertJob({ f, content, postId, postedAt, recruiterId }) {
    const hash = jobHash(f.company, f.title, f.email);
    const res = await sql`
        insert into "Jobs" ("Company", "JobTitle", "Email", "Skills", "Description", "LinkedinId", "JobHash", "PostedAt", "RecruiterId",
            "AiScore", "AiClassification", "Seniority", "Modality", "Location", "Salary")
        values (${f.company}, ${f.title}, ${f.email}, ${sql.json(f.skills)}, ${content}, ${postId}, ${hash}, ${postedAt}, ${recruiterId},
            ${f.confidence}, ${f.classification}, ${f.seniority}, ${f.modality}, ${f.location}, ${f.salary})
        on conflict do nothing
        returning "Id"`;
    return res.length ? 'new' : 'duplicate';
}

async function recruiterIdFor(authorUrl) {
    if (!authorUrl) return null;
    const [rec] = await sql`select "Id" from "Recruiters" where "LinkedinUrl" = ${authorUrl} limit 1`;
    return rec?.Id || null;
}

// Adiciona/atualiza o autor do post na base de recrutadores. Retorna { id, added }.
async function upsertRecruiterFromPost(authorUrl, name, company, email) {
    if (!authorUrl) return { id: null, added: false };
    const [row] = await sql`
        insert into "Recruiters" ("LinkedinUrl", "Name", "Company", "Email", "Status")
        values (${authorUrl}, ${name || null}, ${company || null}, ${email || null}, 'discovered')
        on conflict ("LinkedinUrl") do update set
            "Name"    = coalesce("Recruiters"."Name", excluded."Name"),
            "Company" = coalesce("Recruiters"."Company", excluded."Company"),
            "Email"   = coalesce("Recruiters"."Email", excluded."Email"),
            "UpdatedAt" = now()
        returning "Id", (xmax = 0) as added`;
    return { id: row?.Id || null, added: !!row?.added };
}

// =========================
// FASE 1 — Descoberta de recrutadores
// =========================
export async function runDiscovery({ queries, location = 'Brazil', locations, maxResults = 5, takePages, startPage, runId } = {}) {
    if (!config.apify.profileActorId) throw new Error('APIFY_PROFILE_ACTOR_ID não configurado (actor de perfis)');
    const titles = (queries && queries.length ? queries : ['Tech Recruiter', 'Talent Acquisition']);
    // países/locais: aceita array (locations) ou um único (location)
    const locs = (locations && locations.length) ? locations : (location ? [location] : []);
    const client = apifyClient();

    // Input do actor harvestapi/linkedin-profile-search:
    // searchQuery (string), currentJobTitles (array), maxItems, locations, profileScraperMode,
    // takePages/startPage (paginação). "Full + email search" retorna email.
    const input = {
        searchQuery: titles[0],
        currentJobTitles: titles,
        maxItems: maxResults,
        profileScraperMode: 'Full + email search',
        ...(locs.length ? { locations: locs } : {}),
        ...(takePages ? { takePages } : {}),
        ...(startPage ? { startPage } : {}),
    };

    const run = await client.actor(config.apify.profileActorId).call(input);
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    let added = 0, existing = 0, withEmail = 0;
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
        // xmax = 0 → linha foi INSERIDA (nova); senão foi UPDATE (já existia) → dedup
        const [row] = await sql`
            insert into "Recruiters" ("LinkedinUrl", "LinkedinId", "Name", "Email", "Title", "Company", "Status")
            values (${url}, ${linkedinId}, ${name}, ${email}, ${title}, ${company}, 'discovered')
            on conflict ("LinkedinUrl") do update set
                "LinkedinId" = coalesce(excluded."LinkedinId", "Recruiters"."LinkedinId"),
                "Name"       = coalesce(excluded."Name",       "Recruiters"."Name"),
                "Email"      = coalesce(excluded."Email",      "Recruiters"."Email"),
                "Title"      = coalesce(excluded."Title",      "Recruiters"."Title"),
                "Company"    = coalesce(excluded."Company",    "Recruiters"."Company"),
                "UpdatedAt"  = now()
            returning (xmax = 0) as inserted`;
        if (row?.inserted) added++; else existing++;
    }

    const stats = { found: items.length, novos: added, existentes: existing, withEmail };
    await setRunStats(runId, stats);
    return stats;
}

// =========================
// FASE 2 — Monitoramento de recrutadores aprovados
// =========================
export async function runMonitoring({
    queries, maxPosts = 10, runId, source = 'saved', recruiterIds,
    contentType = 'jobs', postedLimit, sortBy, scrapePages, startPage,
    region = 'global', excludeCountries, maxRecruiters = 10,
} = {}) {
    // Queries entre aspas → o Post Search Scraper trata como frase (busca mais precisa).
    const searchQueries = (queries && queries.length ? queries : ['"hiring software engineer"', '"hiring backend developer"']);

    // Estratégia de origem da busca:
    //  - 'global'   → sem authorUrls (busca em todo o LinkedIn pela query; mais volume/custo)
    //  - 'selected' → apenas os recrutadores escolhidos (recruiterIds)
    //  - 'saved'    → recrutadores aprovados, priorizando os MAIS OBSOLETOS (rotação
    //                 por LastCheckedAt; cap maxRecruiters controla custo Apify). [padrão]
    let authorUrls = [];
    if (source === 'selected' && recruiterIds?.length) {
        authorUrls = (await sql`select "LinkedinUrl" from "Recruiters" where "Id" = any(${recruiterIds}) and "LinkedinUrl" is not null`).map((r) => r.LinkedinUrl);
    } else if (source !== 'global') {
        const cap = maxRecruiters && maxRecruiters > 0 ? maxRecruiters : null;
        authorUrls = (await sql`
            select "LinkedinUrl" from "Recruiters"
            where "Status" = 'approved' and "LinkedinUrl" is not null
            order by "LastCheckedAt" asc nulls first, "Id" asc
            ${cap ? sql`limit ${cap}` : sql``}`).map((r) => r.LinkedinUrl);
        if (!authorUrls.length) {
            authorUrls = (await sql`select "Url" from "RecruiterSources" where "Active" = true`).map((r) => r.Url);
        }
    }

    // 'selected' sem nenhum recrutador monitorável → erro claro (em vez de cair
    // silenciosamente numa busca global, que não é o que o usuário pediu).
    if (source === 'selected' && !authorUrls.length) {
        throw new Error('Nenhum dos recrutadores selecionados tem perfil do LinkedIn (não monitoráveis). Escolha recrutadores com URL do LinkedIn.');
    }

    const client = apifyClient();
    const baseInput = {
        searchQueries,
        maxPosts,
        // contentType 'all' (ou ausente) → NÃO envia o filtro → actor traz todos os
        // posts (tag "jobs" desligada). 'jobs' restringe aos marcados como vaga.
        ...(contentType === 'all' ? {} : { contentType: contentType || 'jobs' }),
        profileScraperMode: 'short',
        scrapeReactions: false,
        scrapeComments: false,
        ...(postedLimit ? { postedLimit } : {}),   // any|1h|24h|week|month|3months|6months|year
        ...(sortBy ? { sortBy } : {}),             // relevance|date
        ...(scrapePages ? { scrapePages } : {}),   // nº de páginas (volume)
        ...(startPage ? { startPage } : { startPage: 1 }),
    };

    // O actor de Post Search aceita NO MÁXIMO 10 authorUrls por execução. Quando
    // monitoramos mais que isso, fatiamos em lotes de 10 (cada lote = 1 chamada Apify).
    // 'global' (sem authorUrls) roda uma única vez.
    const AUTHOR_LIMIT = 10;
    const batches = authorUrls.length
        ? Array.from({ length: Math.ceil(authorUrls.length / AUTHOR_LIMIT) },
            (_, i) => authorUrls.slice(i * AUTHOR_LIMIT, (i + 1) * AUTHOR_LIMIT))
        : [null];

    const items = [];
    for (const batch of batches) {
        const input = batch ? { ...baseInput, authorUrls: batch } : baseInput;
        const run = await client.actor(config.apify.postActorId).call(input);
        const ds = await client.dataset(run.defaultDatasetId).listItems();
        items.push(...ds.items);
    }

    // found = encontrados; novos/duplicados = vagas; descartadosIA/semEmail/rejeitados; aiUsed
    const s = { found: items.length, novos: 0, duplicados: 0, descartadosIA: 0, semEmail: 0, rejeitados: 0, foraRegiao: 0, recrutadoresAdd: 0, aiUsed: 0 };
    let aiCalls = 0;
    for (const item of items) {
        const content = item.content || '';
        const postId = String(item.id);
        const authorName = item.author?.name || null;
        const authorUrl = cleanLinkedinUrl(item.author?.linkedinUrl || '');
        const postedAt = item.postedAt?.date ? new Date(item.postedAt.date) : null;

        // status anterior do post (rejeitado = bloqueado; aprovado = força inclusão)
        const [existing] = await sql`select "Status" from "ScrapedPosts" where "LinkedinId" = ${postId}`;
        const prevStatus = existing?.Status || null;

        // Pré-análise com IA (todo post passa pela IA; respeita o teto por run)
        let ai = null;
        if (aiCalls < config.ai.maxCallsPerRun) {
            aiCalls += 1;
            ai = await analyzeContent(content); // null se IA off / circuito aberto / erro
            if (ai) s.aiUsed += 1;
        }
        const f = deriveJobFields(content, ai, item);

        // Salva o cru sempre (mantém o Status anterior em conflito)
        await sql`
            insert into "ScrapedPosts" ("Source", "Author", "AuthorUrl", "Url", "LinkedinId", "Content", "PostedAt", "AiResult", "Status")
            values ('monitoring', ${authorName}, ${authorUrl || null}, ${item.linkedinUrl || null}, ${postId}, ${content}, ${postedAt}, ${ai ? sql.json(ai) : null}, 'pending')
            on conflict ("LinkedinId") do update set "AiResult" = excluded."AiResult", "PostedAt" = excluded."PostedAt"`;

        if (prevStatus === 'rejected') { s.rejeitados += 1; continue; } // bloqueado permanentemente
        const force = prevStatus === 'approved';
        const qualifies = force || (f.isJob && f.email && (f.confidence == null || f.confidence >= config.ai.minConfidence));
        if (!qualifies) { if (!f.email) s.semEmail += 1; else s.descartadosIA += 1; continue; }
        if (!f.email) { s.semEmail += 1; continue; }

        // Filtro de região (heurística — o Post Search não tem filtro de país)
        if (region === 'br' && !looksBrazil(content, ai, f.email)) { s.foraRegiao += 1; continue; }
        if (excludeCountries?.length && excludeCountries.some((c) => matchesCountry(content, ai, c))) { s.foraRegiao += 1; continue; }

        // O autor do post vira recrutador na base (e a vaga o liga → deixa de ser "órfão").
        const { id: recId, added } = await upsertRecruiterFromPost(authorUrl, authorName, f.company, f.email);
        if (added) s.recrutadoresAdd += 1;
        const r = await insertJob({ f, content, postId, postedAt, recruiterId: recId });
        if (r === 'new') s.novos += 1; else s.duplicados += 1;

        if (recId && postedAt) {
            await sql`update "Recruiters" set "LastPostDate" = greatest(coalesce("LastPostDate", to_timestamp(0)), ${postedAt}), "UpdatedAt" = now() where "Id" = ${recId}`;
        }
    }

    // Cadência: carimba os recrutadores que ESTE run varreu (saved/selected),
    // para a próxima rodada priorizar quem está há mais tempo sem ser checado.
    if (authorUrls.length) {
        await sql`
            update "Recruiters"
            set "LastCheckedAt" = now(), "CheckCount" = "CheckCount" + 1, "UpdatedAt" = now()
            where "LinkedinUrl" = any(${authorUrls})`;
    }

    s.recruiters = authorUrls.length;
    s.source = source;
    await setRunStats(runId, s);
    return s;
}

// Reprocessa um post bruto com a IA (usado pelo admin "reprocessar IA").
export async function reprocessPost(postId) {
    const [post] = await sql`select * from "ScrapedPosts" where "Id" = ${postId}`;
    if (!post) throw new Error('Post não encontrado');
    const ai = await analyzeContent(post.Content || '');
    await sql`update "ScrapedPosts" set "AiResult" = ${ai ? sql.json(ai) : null} where "Id" = ${postId}`;
    return ai;
}

// Aprovação manual: força criar a vaga a partir do post bruto, mesmo se a IA descartou.
export async function materializeJobFromPost(postId) {
    const [post] = await sql`select * from "ScrapedPosts" where "Id" = ${postId}`;
    if (!post) throw new Error('Post não encontrado');
    const f = deriveJobFields(post.Content || '', post.AiResult || null, { author: { name: post.Author } });
    if (!f.email) return { ok: false, reason: 'sem email no post' };
    const recId = await recruiterIdFor(post.AuthorUrl);
    const r = await insertJob({ f, content: post.Content || '', postId: post.LinkedinId, postedAt: post.PostedAt, recruiterId: recId });
    return { ok: true, result: r };
}
