import sql from '../lib/sql.js';
import { computeMatch } from './matching.js';
import { detectArea, detectLevel, detectModality, jobIsBR, areaDaVaga, nivelDaVaga, areaForaDeTI } from './classify.js';
import { idsComDislike } from './jobFeedback.js';
import { vagasDoFeed } from './feedCache.js';
import { emailDeContatoValido, LIKE_EMAIL } from './emailContato.js';
import { expandirAreas, AREAS_FORA_DE_TI } from '../config/areas.js';
import { FILTRO_DATA_ATIVO } from '../config/filtroData.js';
import { niveisAceitos } from '../config/niveis.js';
import { umaPorRecrutador, contatadosRecentes, enderecos } from './mesmoRecrutador.js';
import { foraDoLocal, vagaExclusivaPcd } from './localVaga.js';

// jsonb já volta como array; mantém robusto para string legada
const parseArr = (v) => (Array.isArray(v) ? v : (() => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } })());

// Reexporta a classificação (detectArea/detectLevel vivem em classify.js para
// serem compartilhados com o motor de match sem import circular).
export { detectArea, detectLevel };

const semAcento = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * A pessoa bloqueou esta vaga? É a trava de "não mandar para a empresa onde eu
 * trabalho" (pedido de usuários em 03/11/2026), e por isso olha também o EMAIL:
 * com "Acme" bloqueada, rh@acme.com.br cai mesmo com a empresa extraída errado.
 * Sem acento dos dois lados: quem digita "Itaú" pega o itau.com.br.
 *
 * Usada pelo feed e por applyToJob, a última trava antes do envio.
 */
export function bloqueadaPeloUsuario(job, profile) {
    const skills = parseArr(job.Skills).join(' ');
    const texto = semAcento(`${job.JobTitle || ''} ${job.Company || ''} ${job.Description || ''} ${skills} ${job.Email || ''}`);
    const email = semAcento(job.Email || '');
    // Sem espaços contra o email: "Mercado Livre" tem de pegar rh@mercadolivre.com.
    const bloqueada = (k) => texto.includes(semAcento(k)) || email.includes(semAcento(k).replace(/\s+/g, ''));
    if (parseArr(profile?.BlockedWords).some((k) => k && bloqueada(k))) return true;

    const dominios = parseArr(profile?.BlockedDomains).map((d) => d.toLowerCase());
    const doEmail = enderecos(job.Email).map((e) => e.split('@')[1] || '');
    return doEmail.some((dom) => dominios.some((d) => dom === d || dom.endsWith(`.${d}`)));
}

/** A área de fora de TI desta vaga, se a pessoa marcou essa área. Senão, null. */
function areaForaDeTIEscolhida(job, profile) {
    const marcadas = parseArr(profile?.Areas).filter((a) => AREAS_FORA_DE_TI.includes(a));
    if (!marcadas.length) return null;
    const area = areaForaDeTI(job);
    return marcadas.includes(area) ? area : null;
}

/** Texto em que as palavras exigidas são procuradas. */
function textoDoFiltro(job) {
    return `${job.JobTitle || ''} ${job.Company || ''} ${job.Description || ''} ${parseArr(job.Skills).join(' ')}`.toLowerCase();
}

export function passesFilters(job, profile) {
    // Vaga de outra profissão NUNCA entra, com ou sem perfil e com ou sem filtro
    // de área. Esta é uma plataforma de vagas de tecnologia: "Assistente
    // Operacional de Logística" no feed de um dev não é filtro mal configurado,
    // é ruído do scraper — que lê posts de recrutador anunciando de tudo.
    // Vem antes do `if (!profile)` de propósito: vale até para quem ainda não
    // preencheu o perfil.
    //
    // Única exceção: quem MARCOU uma área de fora de TI (config/areas.js) recebe
    // as vagas daquela área. Opt-in: sem marcar, nada muda.
    const foraDeTI = areaForaDeTIEscolhida(job, profile);
    if (!foraDeTI && areaDaVaga(job) === 'nontech') return false;

    // Vaga cujo "email" é telefone, link ou a palavra "informado" NUNCA entra.
    // Vem antes do `if (!profile)` pelo mesmo motivo do nontech: não é filtro
    // mal configurado, é lixo da extração, e vale para todo mundo.
    //
    // Sem isto a vaga era oferecida, entrava na fila, o Gmail recusava
    // ("Recipient address required") e o worker retentava por horas com a linha
    // presa em `queued` — o painel do usuário ficava "enviando" para sempre.
    if (!emailDeContatoValido(job.Email)) return false;

    // Só quem marcou no perfil vê. Vem antes do `if (!profile)` porque quem ainda
    // não tem perfil também não marcou.
    if (!profile?.ShowPcd && vagaExclusivaPcd(job)) return false;

    if (!profile) return true;

    // Preferência de país do usuário (br | intl)
    const region = profile.Region || 'br';
    if (region === 'br' && !jobIsBR(job)) return false;
    if (region === 'intl' && jobIsBR(job)) return false;
    const required = parseArr(profile.RequiredKeywords).map((k) => k.toLowerCase());
    if (required.length) {
        const text = textoDoFiltro(job);
        if (!required.some((k) => text.includes(k))) return false;
    }

    if (bloqueadaPeloUsuario(job, profile)) return false;

    // FILTRO_DATA_ATIVO desligado por ora (config/filtroData.js). O valor de
    // cada pessoa segue salvo; é só religar a chave.
    if (FILTRO_DATA_ATIVO && profile.PostingDays && job.CreatedAt) {
        const created = new Date(job.CreatedAt).getTime();
        if ((Date.now() - created) / 86400000 > profile.PostingDays) return false;
    }

    // Nível escolhido sempre filtra, com folga de um degrau (config/niveis.js).
    const levels = niveisAceitos(profile);
    if (levels.length) {
        const lvl = nivelDaVaga(job);
        if (lvl && !levels.includes(lvl)) return false;
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

    if (foraDoLocal(job, profile)) return false;

    // Área profissional: descarta vagas de outro cargo (ex.: QA não recebe vaga de Dev).
    // Só filtra quando a área da vaga é identificável (≠ 'other'), p/ não perder vaga boa.
    // expandirAreas: quem escolheu 'dev' recebe front/back/full também, e
    // vice-versa. Sem isso, todo perfil salvo antes da divisão receberia zero
    // vaga no dia do deploy. Ver config/areas.js.
    const areas = expandirAreas(parseArr(profile.Areas));
    if (areas.length) {
        const area = foraDeTI || areaDaVaga(job);
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
        // Classificação persistida: a tela mostra área, nível e modalidade em
        // cada vaga para a pessoa decidir sem abrir o post.
        area: (job.Area === 'nontech' ? areaForaDeTI(job) : job.Area) ?? null, level: job.Level ?? null, mods: parseArr(job.Mods), location: job.Location ?? null,
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
        where j."Email" is not null and j."Email" like ${LIKE_EMAIL}
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


// Teto do feed de uma pessoa. Não é paginação: é o limite de quanto o processo
// monta e devolve de uma vez. As vagas chegam das mais recentes para as mais
// antigas, então ficam as 1500 MAIS RECENTES que passaram no filtro (ninguém
// percorre 1500 vagas).
const MATCHES_MAX = Number(process.env.MATCHES_MAX) || 1500;

/**
 * Filtra as vagas em memória (services/feedCache.js) para uma pessoa.
 *
 * Dois passos, e a divisão importa. Primeiro o corte BARATO: colunas gravadas na
 * inserção (migration 0014) e as palavras da pessoa, que descartam a maior parte
 * sem rodar nenhuma regex. Só o que sobra vai para passesFilters, a autoridade
 * final: ele reclassifica o texto, e fazer isso nas ~8 mil vagas a cada
 * requisição custava ~1,2 s por usuário na VM.
 *
 * O corte barato NUNCA pode ser mais restritivo que passesFilters: se divergirem,
 * vaga boa some em silêncio, sem erro e sem log. Confira com `npm run check:feed`.
 */
export function candidatasDoPerfil(vagas, profile, resolvidas = new Set()) {
    const dias = FILTRO_DATA_ATIVO && Number(profile?.PostingDays) > 0 ? Number(profile.PostingDays) : null;
    const desde = dias ? Date.now() - dias * 86400000 : null;
    const paraFora = (profile?.Region || 'br') === 'intl';
    const areas = new Set(expandirAreas(parseArr(profile?.Areas)));
    const querForaDeTI = AREAS_FORA_DE_TI.some((a) => areas.has(a));
    const niveis = new Set(niveisAceitos(profile));
    const mods = parseArr(profile?.Modalities).map((m) => String(m).toLowerCase());
    const exigidas = parseArr(profile?.RequiredKeywords).filter(Boolean).map((k) => k.toLowerCase());
    const temBloqueio = parseArr(profile?.BlockedWords).length > 0 || parseArr(profile?.BlockedDomains).length > 0;

    const saida = [];
    for (const j of vagas) {
        if (resolvidas.has(String(j.Id))) continue;
        if (desde && new Date(j.CreatedAt).getTime() < desde) continue;
        if (profile && j.IsBR === paraFora) continue;
        // Vaga que não deu para classificar PASSA: título ruim não é vaga ruim, e
        // o balde dos indefinidos tinha Tech Lead e Arquiteto de Software dentro.
        if (j.Area === 'nontech') {
            // Quem decide a área de fora de TI é passesFilters, abaixo.
            if (!querForaDeTI) continue;
        } else if (areas.size && j.Area != null && j.Area !== 'other' && !areas.has(j.Area)) continue;
        if (niveis.size && j.Level != null && !niveis.has(j.Level)) continue;
        if (mods.length && j.Mods != null && !parseArr(j.Mods).some((m) => mods.includes(m))) continue;
        if (exigidas.length) {
            const texto = textoDoFiltro(j);
            if (!exigidas.some((k) => texto.includes(k))) continue;
        }
        if (temBloqueio && bloqueadaPeloUsuario(j, profile)) continue;
        if (!passesFilters(j, profile)) continue;
        saida.push(j);
        if (saida.length >= MATCHES_MAX) break;
    }
    return saida;
}

async function computeMatches(userId) {
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${userId}`;
    const vagas = await vagasDoFeed();
    const candidaturas = await sql`select "JobId" from "Applications" where "UserId" = ${userId}`;
    // Já enviada ou com 👎: sai do feed desta pessoa.
    const resolvidas = new Set([...candidaturas.map((r) => String(r.JobId)), ...await idsComDislike(userId)]);

    const noneApplied = new Set(); // as candidatadas já saíram acima
    const ordenadas = candidatasDoPerfil(vagas, profile, resolvidas)
        .map((j) => shapeJob(j, profile, noneApplied))
        .sort((a, b) => b.matchScore - a.matchScore);
    // Uma vaga por recrutador (a de maior match) e nenhuma de quem já recebeu
    // currículo desta pessoa nos últimos 30 dias (services/mesmoRecrutador.js).
    return umaPorRecrutador(ordenadas, await contatadosRecentes(userId));
}
