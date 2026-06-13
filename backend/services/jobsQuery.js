import sql from '../lib/sql.js';
import { computeMatch } from './matching.js';

// jsonb já volta como array; mantém robusto para string legada
const parseArr = (v) => (Array.isArray(v) ? v : (() => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } })());

export function detectLevel(text = '') {
    const t = text.toLowerCase();
    if (/gerente|manager|head\b/.test(t)) return 'manager';
    if (/tech lead|\blead\b|l[íi]der t[ée]cnico|staff|principal/.test(t)) return 'lead';
    if (/especialista|specialist/.test(t)) return 'senior';
    if (/s[êe]nior|senior|\bsr\b/.test(t)) return 'senior';
    if (/pleno|\bpl\b|mid[-\s]?level/.test(t)) return 'pleno';
    if (/j[úu]nior|junior|\bjr\b|entry/.test(t)) return 'junior';
    if (/est[áa]gi|intern|trainee/.test(t)) return 'estagio';
    return null;
}

export function passesFilters(job, profile) {
    if (!profile) return true;
    const skillsText = parseArr(job.Skills).join(' ');
    const text = `${job.JobTitle || ''} ${job.Company || ''} ${job.Description || ''} ${skillsText}`.toLowerCase();

    const required = parseArr(profile.RequiredKeywords).map((k) => k.toLowerCase());
    if (required.length && !required.some((k) => text.includes(k))) return false;

    const blocked = parseArr(profile.BlockedWords).map((k) => k.toLowerCase());
    if (blocked.some((k) => k && text.includes(k))) return false;

    const domains = parseArr(profile.BlockedDomains).map((d) => d.toLowerCase());
    if (domains.length && job.Email) {
        const dom = job.Email.split('@')[1]?.toLowerCase() || '';
        if (domains.some((d) => dom === d || dom.endsWith(`.${d}`))) return false;
    }

    if (profile.PostingDays && job.CreatedAt) {
        const created = new Date(job.CreatedAt).getTime();
        if ((Date.now() - created) / 86400000 > profile.PostingDays) return false;
    }

    if (profile.StrictLevel) {
        const levels = parseArr(profile.Levels);
        if (levels.length) {
            const lvl = detectLevel(`${job.JobTitle || ''} ${job.Description || ''}`);
            if (lvl && !levels.includes(lvl)) return false;
        }
    }
    return true;
}

export function shapeJob(job, profile, appliedSet) {
    const match = computeMatch(profile, job);
    return {
        id: job.Id, company: job.Company, title: job.JobTitle, email: job.Email,
        skills: parseArr(job.Skills), description: job.Description, createdAt: job.CreatedAt,
        matchScore: match.score, matchedSkills: match.matched, missingSkills: match.missing,
        applied: appliedSet.has(job.Id),
    };
}

/** Lista vagas para o usuário (com filtros opcionais). */
export async function listForUser(userId, { ignoreFilters = false } = {}) {
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${userId}`;
    const appliedRows = await sql`select "JobId" from "Applications" where "UserId" = ${userId}`;
    const appliedSet = new Set(appliedRows.map((r) => r.JobId));
    const raw = await sql`select * from "Jobs" order by "CreatedAt" desc, "Id" desc`;
    const kept = ignoreFilters ? raw : raw.filter((j) => passesFilters(j, profile));
    return {
        profile, appliedSet,
        jobs: kept.map((j) => shapeJob(j, profile, appliedSet)),
        filteredOut: raw.length - kept.length,
    };
}

/** Vagas "candidatáveis": passam nos filtros, têm email e ainda não foram enviadas. */
export async function getMatches(userId) {
    const { jobs } = await listForUser(userId);
    return jobs
        .filter((j) => j.email && !j.applied)
        .sort((a, b) => b.matchScore - a.matchScore);
}
