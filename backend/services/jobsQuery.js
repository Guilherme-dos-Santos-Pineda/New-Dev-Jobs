import sql from '../lib/sql.js';
import { computeMatch } from './matching.js';
import { detectArea, detectLevel, detectModality, jobIsBR } from './classify.js';

// jsonb já volta como array; mantém robusto para string legada
const parseArr = (v) => (Array.isArray(v) ? v : (() => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } })());

// Reexporta a classificação (detectArea/detectLevel vivem em classify.js para
// serem compartilhados com o motor de match sem import circular).
export { detectArea, detectLevel };

export function passesFilters(job, profile) {
    // Vaga de outra profissão NUNCA entra, com ou sem perfil e com ou sem filtro
    // de área. Esta é uma plataforma de vagas de tecnologia: "Assistente
    // Operacional de Logística" no feed de um dev não é filtro mal configurado,
    // é ruído do scraper — que lê posts de recrutador anunciando de tudo.
    // Vem antes do `if (!profile)` de propósito: vale até para quem ainda não
    // preencheu o perfil.
    if (detectArea(job) === 'nontech') return false;

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

    // Modalidade (remoto / híbrido / presencial). O usuário escolhe no perfil e
    // até agora isso NÃO FAZIA NADA: "Modalities" era salvo e nunca lido — filtro
    // decorativo. Marcar "home office" e continuar recebendo vaga presencial é o
    // tipo de coisa que faz o usuário deixar de confiar no resto dos filtros.
    //
    // Vaga sem modalidade identificável PASSA de propósito: 54% da base não tem o
    // campo preenchido, então bloquear as indefinidas esconderia metade das vagas
    // boas para punir uma minoria de ruins.
    const modalidades = parseArr(profile.Modalities).map((m) => String(m).toLowerCase());
    if (modalidades.length) {
        const daVaga = detectModality(job);
        if (daVaga && !daVaga.some((m) => modalidades.includes(m))) return false;
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


// Teto de vagas trazidas do banco por consulta. Não é paginação: é o limite de
// quanto o processo aceita segurar em memória de uma vez. Como o SQL abaixo já
// aplicou área, modalidade, nível, país e data, essas são as vagas do feed —
// pegar as 1500 MAIS RECENTES entre elas é uma perda aceitável (ninguém percorre
// 1500 vagas), e sem teto uma base de 50 mil vagas derruba a VM de 954 MB.
const MATCHES_MAX = Number(process.env.MATCHES_MAX) || 1500;

/**
 * Traz do banco só as vagas que podem entrar no feed do usuário.
 *
 * O filtro vive em DOIS lugares de propósito, e a divisão importa:
 *
 *  • Aqui (SQL) ficam os critérios que dependem só da VAGA — área, nível,
 *    modalidade, país, data. Eles foram pré-calculados na inserção e gravados em
 *    colunas indexadas (migration 0014), então o banco descarta as vagas
 *    incompatíveis SEM enviá-las. Antes, `select * from "Jobs"` trazia a tabela
 *    inteira para o Node reclassificar em JavaScript a cada requisição de cada
 *    usuário: ~12 MB e ~1,2 s com 6 mil vagas, mais de 75 MB com 50 mil.
 *
 *  • Em passesFilters (JS) ficam os critérios textuais do usuário (palavras
 *    exigidas/bloqueadas, domínios), que não valem um índice, e ele roda DE NOVO
 *    sobre o que chegou — é a autoridade final. Por isso o SQL nunca pode ser
 *    mais restritivo que o JS: se divergirem, o JS corta o excesso; o contrário
 *    sumiria com vaga boa sem ninguém perceber.
 */
// Reproduz em SQL o texto que passesFilters monta em JS: título + empresa +
// descrição + skills separadas por espaço. As skills viram texto pelo caminho
// mais barato (tirar `["`, `",`, `"]` e colapsar espaços) em vez de um
// jsonb_array_elements_text por linha — o resultado é o mesmo e não custa um
// lateral join. Se este texto ficasse MENOR que o do JS, o SQL seria mais
// restritivo que o filtro autoritativo e sumiria com vaga boa em silêncio.
// FUNÇÃO, não constante: `sql` é null quando DATABASE_URL não está definido, e um
// sql`` no topo do módulo quebraria o IMPORT — o que derrubou a suíte inteira no
// CI, que roda sem banco de propósito (os testes são de lógica pura).
const textoDaVaga = () => sql`(
    coalesce(j."JobTitle",'') || ' ' || coalesce(j."Company",'') || ' ' ||
    coalesce(j."Description",'') || ' ' ||
    coalesce(regexp_replace(translate(j."Skills"::text, '[]",', '    '), '\\s+', ' ', 'g'), '')
)`;

// `includes()` do JS é substring literal; ILIKE trata % e _ como curinga. Sem
// escapar, uma palavra bloqueada com "%" casaria com tudo.
const paraLike = (k) => `%${String(k).replace(/([\\%_])/g, '\\$1')}%`;

async function buscarCandidatas(userId, profile) {
    const dias = Number(profile?.PostingDays) > 0 ? Number(profile.PostingDays) : null;
    const region = profile?.Region || 'br';
    const areas = parseArr(profile?.Areas);
    const mods = parseArr(profile?.Modalities).map((m) => String(m).toLowerCase());
    const levels = profile?.StrictLevel ? parseArr(profile?.Levels) : [];
    // Palavras exigidas/bloqueadas também vão para o SQL. Não é otimização de
    // sobra: eram o filtro que mais cortava (um perfil de segurança guardava 421
    // de 1500 vagas), então deixá-las em JS fazia o teto de linhas ser gasto com
    // vagas que seriam descartadas na chegada — e o feed perdia 39% do que devia
    // mostrar. Filtrando aqui, o teto passa a valer sobre o resultado de verdade.
    const exigidas = parseArr(profile?.RequiredKeywords).filter(Boolean).map(paraLike);
    const bloqueadas = parseArr(profile?.BlockedWords).filter(Boolean).map(paraLike);

    return sql`
        select j.* from "Jobs" j
        where j."Email" is not null and j."Email" <> ''
          -- Vaga de outra profissão nunca entra, com ou sem perfil configurado.
          and coalesce(j."Area", 'other') <> 'nontech'
          and not exists (
              select 1 from "Applications" a
              where a."UserId" = ${userId} and a."JobId" = j."Id"
          )
          ${dias ? sql`and j."CreatedAt" >= now() - make_interval(days => ${dias})` : sql``}
          ${profile ? (region === 'intl'
              ? sql`and j."IsBR" is not true`
              : sql`and j."IsBR" is not false`) : sql``}
          -- Área/nível/modalidade: o "is null" repete o critério do JS — vaga que
          -- não deu para classificar PASSA. Título ruim não é vaga ruim, e o balde
          -- dos indefinidos tinha Tech Lead e Arquiteto de Software dentro.
          -- Os ::text[] são obrigatórios, não decoração. Sem eles o tipo do
          -- parâmetro fica por conta da inferência do servidor, e atrás do
          -- PgBouncer em transaction mode a mesma consulta cai em conexões
          -- diferentes a cada execução: em produção isso deu "malformed array
          -- literal" em 1 requisição de 8, e só sob concorrência. O cast explícito
          -- tira a inferência da jogada.
          ${areas.length ? sql`and (j."Area" is null or j."Area" = 'other' or j."Area" = any(${areas}::text[]))` : sql``}
          ${levels.length ? sql`and (j."Level" is null or j."Level" = any(${levels}::text[]))` : sql``}
          ${mods.length ? sql`and (j."Mods" is null or jsonb_exists_any(j."Mods", ${mods}::text[]))` : sql``}
          ${exigidas.length ? sql`and ${textoDaVaga()} ilike any (${exigidas}::text[])` : sql``}
          ${bloqueadas.length ? sql`and not (${textoDaVaga()} ilike any (${bloqueadas}::text[]))` : sql``}
        order by j."CreatedAt" desc, j."Id" desc
        limit ${MATCHES_MAX}`;
}

async function computeMatches(userId) {
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${userId}`;
    const rows = await buscarCandidatas(userId, profile);

    const noneApplied = new Set(); // a query já excluiu as candidatadas
    return rows
        .filter((j) => passesFilters(j, profile))
        .map((j) => shapeJob(j, profile, noneApplied))
        .sort((a, b) => b.matchScore - a.matchScore);
}
