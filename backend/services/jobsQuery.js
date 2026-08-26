import sql from '../lib/sql.js';
import { computeMatch } from './matching.js';
import { detectArea, detectLevel } from './classify.js';

// jsonb já volta como array; mantém robusto para string legada
const parseArr = (v) => (Array.isArray(v) ? v : (() => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } })());

// Reexporta a classificação (detectArea/detectLevel vivem em classify.js para
// serem compartilhados com o motor de match sem import circular).
export { detectArea, detectLevel };

const BR_HINT = /brasil|brazil|s[ãa]o paulo|rio de janeiro|belo horizonte|curitiba|porto alegre|bras[íi]lia|fortaleza|recife|salvador|campinas|florian[óo]polis/i;
// Heurística leve de país da vaga (mesma lógica do scraper)
function jobIsBR(job) {
    const dom = (job.Email || '').split('@')[1]?.toLowerCase() || '';
    if (dom.endsWith('.br')) return true;
    const text = `${job.Location || ''} ${job.JobTitle || ''} ${job.Description || ''}`;
    if (BR_HINT.test(text)) return true;
    return /[ãõçáéíóúâê]/i.test(job.Description || '') && /\b(vaga|currículo|contratando|desenvolvedor)\b/i.test(text);
}

export function passesFilters(job, profile) {
    if (!profile) return true;

    // Preferência de país do usuário (br | intl)
    const region = profile.Region || 'br';
    if (region === 'br' && !jobIsBR(job)) return false;
    if (region === 'intl' && jobIsBR(job)) return false;
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

    // Área profissional: descarta vagas de outro cargo (ex.: QA não recebe vaga de Dev).
    // Só filtra quando a área da vaga é identificável (≠ 'other'), p/ não perder vaga boa.
    const areas = parseArr(profile.Areas);
    if (areas.length) {
        const area = detectArea(job);
        if (area !== 'other' && !areas.includes(area)) return false;
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

/**
 * Quantas vagas têm email e ainda não foram enviadas por este usuário —
 * IGNORANDO os filtros do perfil. Serve para dizer "seus filtros escondem N
 * vagas". Espelha exatamente o `jobs.filter((j) => j.email && !j.applied)` que
 * existia antes, mas conta no banco em vez de trazer a tabela inteira para o
 * Node só para medir o tamanho dela.
 */
export async function countCandidatable(userId) {
    const [row] = await sql`
        select count(*)::int as n from "Jobs" j
        where j."Email" is not null and j."Email" <> ''
          and not exists (
              select 1 from "Applications" a
              where a."UserId" = ${userId} and a."JobId" = j."Id"
          )`;
    return row?.n ?? 0;
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

/**
 * Vagas "candidatáveis": passam nos filtros, têm email e ainda não foram enviadas.
 * A exclusão de "sem email" e "já candidatada" é feita no SQL (usa o índice de
 * Applications) para não trazer a tabela inteira de Jobs à memória — só o que
 * resta passa pelo matcher em JS. Resultado idêntico ao filtro antigo em JS.
 */
// Memo curto por usuário. Abrir o dashboard e a tela de vagas em sequência, ou
// iniciar um envio logo depois, recalculava tudo do zero a cada vez — e "tudo"
// aqui custa ~1,4s de banco e ~12 MB por chamada (medido com 6270 vagas).
//
// A janela é curta de propósito: vaga nova precisa aparecer rápido. O cache é
// invalidado explicitamente quando o usuário se candidata (invalidateMatches),
// que é a única ação dele capaz de mudar o próprio resultado.
const matchesCache = new Map(); // userId -> { at, promise }
const MATCHES_TTL_MS = Number(process.env.MATCHES_TTL_MS) || 20_000;

/** Descarta o memo do usuário. Chamar após candidatura/alteração de perfil. */
export function invalidateMatches(userId) {
    matchesCache.delete(String(userId));
}

export async function getMatches(userId) {
    const chave = String(userId);
    const agora = Date.now();
    const memo = matchesCache.get(chave);
    // Guarda a PROMISE, não o resultado: dois requests simultâneos (dashboard e
    // /jobs/matches carregam juntos) compartilham uma execução em vez de
    // dispararem duas varreduras concorrentes de 12 MB na mesma VM de 1 GB.
    if (memo && agora - memo.at < MATCHES_TTL_MS) return memo.promise;

    const promise = computeMatches(userId).catch((e) => {
        matchesCache.delete(chave); // falha não fica cacheada
        throw e;
    });
    matchesCache.set(chave, { at: agora, promise });

    // O Map cresceria com um usuário por chave; limpa os vencidos de vez em quando.
    if (matchesCache.size > 50) {
        for (const [k, v] of matchesCache) if (agora - v.at >= MATCHES_TTL_MS) matchesCache.delete(k);
    }
    return promise;
}

async function computeMatches(userId) {
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${userId}`;

    // "PostingDays" é um filtro EXATO por data — o mesmo que passesFilters aplica
    // em JS logo abaixo. Fazê-lo no SQL não muda o resultado e evita transferir
    // vagas que seriam descartadas na chegada. Para quem usa "últimos 7 dias",
    // isso é a diferença entre trazer 6270 linhas e trazer algumas centenas.
    const dias = Number(profile?.PostingDays) > 0 ? Number(profile.PostingDays) : null;

    const rows = await sql`
        select j.* from "Jobs" j
        where j."Email" is not null and j."Email" <> ''
          and not exists (
              select 1 from "Applications" a
              where a."UserId" = ${userId} and a."JobId" = j."Id"
          )
          ${dias ? sql`and j."CreatedAt" >= now() - make_interval(days => ${dias})` : sql``}
        order by j."CreatedAt" desc, j."Id" desc`;

    const noneApplied = new Set(); // a query já excluiu as candidatadas
    return rows
        .filter((j) => passesFilters(j, profile))
        .map((j) => shapeJob(j, profile, noneApplied))
        .sort((a, b) => b.matchScore - a.matchScore);
}
