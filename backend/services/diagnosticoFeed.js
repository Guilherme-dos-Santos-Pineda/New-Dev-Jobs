import sql from '../lib/sql.js';
import { getMatches } from './jobsQuery.js';
import { expandirAreas } from '../config/areas.js';
import { LIKE_EMAIL } from './emailContato.js';
import { FILTRO_DATA_ATIVO } from '../config/filtroData.js';

// =========================
// Por que esta pessoa vê poucas vagas? (só admin)
// =========================
// Nasceu de um caso real: um usuário reclamou de "achar pouquíssima vaga de
// front-end". O número final (116) não dizia nada sozinho. O que resolveu foi
// ver ONDE as vagas sumiam, etapa por etapa:
//
//   com email           7955
//   + área              5484
//   + país              2111
//   + data de postagem   384   <- 82% do corte estava aqui
//   + palavras dele      116
//
// Só com a cascata dava para responder "o problema é o seu filtro de data",
// em vez de sair mexendo no classificador no escuro. Por isso a tela mostra os
// DEGRAUS, e não só o total: total sem degrau é o número que já existia no
// dashboard e que não ajudou ninguém.
//
// As consultas são SEQUENCIAIS de propósito. O pool tem 25 conexões e a regra
// do projeto é não disparar muitas em paralelo numa requisição; aqui são ~7
// contagens, e uma tela de admin usada por uma pessoa não justifica arriscar o
// pool de todo mundo para economizar 300 ms.

const parseArr = (v) => (Array.isArray(v) ? v : (() => {
    try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; }
})());

const paraLike = (k) => `%${String(k).toLowerCase()}%`;
const textoDaVaga = () => sql`lower(coalesce(j."JobTitle",'') || ' ' || coalesce(j."Company",'') || ' ' || coalesce(j."Description",''))`;

/** Uma contagem sobre Jobs, com os filtros acumulados até certo ponto. */
async function contar(userId, extra) {
    const [r] = await sql`
        select count(*)::int as n from "Jobs" j
        where j."Email" is not null and j."Email" like ${LIKE_EMAIL}
          and coalesce(j."Area", 'other') <> 'nontech'
          and not exists (
              select 1 from "Applications" a
              where a."UserId" = ${userId} and a."JobId" = j."Id"
          )
          ${extra}`;
    return r.n;
}

/**
 * Cascata de filtros de um usuário: quantas vagas restam depois de cada etapa.
 * @returns {{total:number, etapas:Array<{nome:string, restam:number, perdeu:number}>, ...}}
 */
export async function diagnosticoDoFeed(userId) {
    const [perfil] = await sql`select * from "Profiles" where "UserId" = ${userId}`;

    const areas = expandirAreas(parseArr(perfil?.Areas));
    const niveis = perfil?.StrictLevel ? parseArr(perfil?.Levels) : [];
    const mods = parseArr(perfil?.Modalities).map((m) => String(m).toLowerCase());
    const exigidas = parseArr(perfil?.RequiredKeywords).filter(Boolean).map(paraLike);
    const bloqueadas = parseArr(perfil?.BlockedWords).filter(Boolean).map(paraLike);
    const regiao = perfil?.Region || 'br';
    const dias = FILTRO_DATA_ATIVO && Number(perfil?.PostingDays) > 0 ? Number(perfil.PostingDays) : null;

    // Os pedaços de SQL são os MESMOS de buscarCandidatas, na mesma ordem. Se
    // divergirem, o diagnóstico mente e manda o admin arrumar o lugar errado.
    const fArea = areas.length ? sql`and (j."Area" is null or j."Area" = 'other' or j."Area" = any(${areas}::text[]))` : sql``;
    const fPais = perfil ? (regiao === 'intl' ? sql`and j."IsBR" is not true` : sql`and j."IsBR" is not false`) : sql``;
    const fData = dias ? sql`and j."CreatedAt" >= now() - make_interval(days => ${dias})` : sql``;
    const fNivel = niveis.length ? sql`and (j."Level" is null or j."Level" = any(${niveis}::text[]))` : sql``;
    const fMod = mods.length ? sql`and (j."Mods" is null or jsonb_exists_any(j."Mods", ${mods}::text[]))` : sql``;
    const fExig = exigidas.length ? sql`and ${textoDaVaga()} ilike any (${exigidas}::text[])` : sql``;
    const fBloq = bloqueadas.length ? sql`and not (${textoDaVaga()} ilike any (${bloqueadas}::text[]))` : sql``;

    const etapas = [];
    let anterior = null;
    const passo = async (nome, detalhe, extra) => {
        const restam = await contar(userId, extra);
        etapas.push({ nome, detalhe, restam, perdeu: anterior === null ? 0 : anterior - restam });
        anterior = restam;
        return restam;
    };

    await passo('vagas disponíveis', 'com email válido, fora de outras profissões, ainda não enviadas', sql``);
    if (areas.length) await passo('área', areas.join(', '), sql`${fArea}`);
    await passo('país', regiao === 'intl' ? 'fora do Brasil' : 'Brasil', sql`${fArea} ${fPais}`);
    if (dias) await passo('data de postagem', `últimos ${dias} dias`, sql`${fArea} ${fPais} ${fData}`);
    if (niveis.length) await passo('senioridade', `${niveis.join(', ')} (modo estrito)`, sql`${fArea} ${fPais} ${fData} ${fNivel}`);
    if (mods.length) await passo('modalidade', mods.join(', '), sql`${fArea} ${fPais} ${fData} ${fNivel} ${fMod}`);
    if (exigidas.length) await passo('palavras exigidas', `${parseArr(perfil.RequiredKeywords).join(', ')} (basta UMA)`, sql`${fArea} ${fPais} ${fData} ${fNivel} ${fMod} ${fExig}`);
    if (bloqueadas.length) await passo('palavras bloqueadas', parseArr(perfil.BlockedWords).join(', '), sql`${fArea} ${fPais} ${fData} ${fNivel} ${fMod} ${fExig} ${fBloq}`);

    // O número que a pessoa vê de verdade. Pode ser MENOR que a última etapa:
    // o passesFilters em JS roda de novo por cima e é a autoridade final
    // (domínios bloqueados), e existe o teto de 1500.
    const matches = await getMatches(userId);
    const comMatchAlto = matches.filter((m) => m.matchScore >= 50).length;

    // O degrau que mais corta é o que o admin precisa atacar. Dizer isso aqui
    // evita ler a tabela inteira e mexer no lugar errado.
    const maior = etapas.slice(1).reduce((a, b) => (b.perdeu > (a?.perdeu ?? -1) ? b : a), null);

    return {
        temPerfil: !!perfil,
        etapas,
        noFeed: matches.length,
        comMatchAlto,      // >= 50%: é o corte do envio automático
        maiorDegrau: maior ? { nome: maior.nome, perdeu: maior.perdeu } : null,
        exemplos: matches.slice(0, 8).map((m) => ({ titulo: m.title, empresa: m.company, score: m.matchScore })),
    };
}
