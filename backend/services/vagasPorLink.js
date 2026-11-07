import sql from '../lib/sql.js';
import { classifyJob, areaForaDeTI } from './classify.js';
import { passesFilters } from './jobsQuery.js';
import { computeMatch } from './matching.js';
import { extractSkills } from './scraper.js';
import { semContato } from './highlights.js';
import { linkDoPost } from './linkDoPost.js';

// =========================
// Vagas por link
// =========================
// Post sem email nunca vira vaga em "Jobs": o envio precisa do endereço. Só que
// esses posts já são pagos e guardados em "ScrapedPosts" (medido em 07/11/2026:
// ~500 de TI no Brasil em 26 dias, perto de 19 por dia, contra ~40 com email), e a
// candidatura está num link. Esta lista mostra essas vagas sem tocar no envio:
//   - lê "ScrapedPosts": sem migration, sem crédito da Apify, sem chamada à IA;
//   - não entra em "Jobs", então fila, cota, automático e destaques nem as veem;
//   - o filtro é o mesmo passesFilters do feed;
//   - sem email no post, o link para ele não entrega contato nenhum.
//
// Fica em memória, igual ao feed (ver feedCache.js): o limite do Supabase grátis é
// o egress. Depois da primeira carga só vêm os posts novos.

const DIAS_DE_VAGA = 30;
const ATUALIZA_MS = 10 * 60 * 1000;
const TETO_DE_POSTS = 3000;
const TETO_DA_RESPOSTA = 100;
const PREVIEW_CHARS = 400;
const DIA_MS = 86400000;

// Texto para o SQL: `\y` e companhia somem num template do postgres.js.
const EMAIL_SQL = '[a-z0-9._-]+@[a-z0-9-]+\\.[a-z]{2,}';
const LINK_SQL = '(https?://|lnkd\\.in|gupy\\.io|bit\\.ly)';

const TEM_EMAIL = /[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}/i;
const TEM_LINK = /https?:\/\/|lnkd\.in|gupy\.io|bit\.ly/i;
const ANUNCIA_VAGA = /\b(vagas?|contratando|contrata[çc][ãa]o|oportunidades?|estamos em busca|candidate-se|hiring)\b/i;

// O que abre o post e não diz nada sobre a vaga: "🚀 OPORTUNIDADE | Dev Java".
const ABERTURA = /^(nova\s+)?(vagas?(\s+aberta)?|oportunidades?(\s+nova)?|estamos contratando|contratando)\s*[:|\-–]\s*/i;

/** A primeira linha do post, sem emoji e sem a palavra "vaga" na frente. */
export function tituloDoPost(texto) {
    const linha = String(texto || '').split('\n')
        .map((l) => l.replace(/[\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim())
        .find((l) => l.length > 5) || '';
    const titulo = linha.replace(ABERTURA, '').trim() || linha;
    return titulo.length > 100 ? `${titulo.slice(0, 97).trimEnd()}...` : titulo;
}

/** O post no formato de vaga, ou null se não for vaga por link. */
export function vagaDoPost(post) {
    const texto = String(post.Content || '');
    if (TEM_EMAIL.test(texto) || !TEM_LINK.test(texto) || !ANUNCIA_VAGA.test(texto)) return null;
    const url = linkDoPost(post.LinkedinId) || post.Url;
    if (!url) return null;

    const vaga = {
        Id: `link-${post.Id}`, JobTitle: tituloDoPost(texto), Company: '', Email: '', Description: texto,
        Skills: extractSkills(texto), Location: null, Modality: null, CreatedAt: post.PostedAt || post.CreatedAt, url,
    };
    const { area, level, mods, isBR } = classifyJob(vaga);
    Object.assign(vaga, { Area: area, Level: level, Mods: mods, IsBR: isBR });
    // Título vago não entra: sem texto de vaga e sem email não dá para saber o que é.
    if (area === 'other' || (area === 'nontech' && !areaForaDeTI(vaga))) return null;
    return vaga;
}

/** O mesmo anúncio repostado aparece uma vez só, a versão mais nova. */
export function semRepetidas(vagas) {
    const vistas = new Set();
    return [...vagas]
        .sort((a, b) => new Date(b.CreatedAt) - new Date(a.CreatedAt))
        .filter((v) => {
            const chave = v.JobTitle.toLowerCase();
            if (vistas.has(chave)) return false;
            vistas.add(chave);
            return true;
        });
}

const faixaDeIdade = (data, agora) => {
    const dias = (agora - new Date(data).getTime()) / DIA_MS;
    return dias <= 7 ? 0 : 1;
};

/** O que esta pessoa vê: o filtro do feed, a semana primeiro e, nela, o melhor match. */
export function vagasParaPerfil(vagas, perfil, agora = Date.now()) {
    return vagas
        .filter((v) => agora - new Date(v.CreatedAt).getTime() <= DIAS_DE_VAGA * DIA_MS)
        .filter((v) => passesFilters(v, perfil, { semEmail: true }))
        .map((v) => ({ vaga: v, score: computeMatch(perfil, v).score }))
        .sort((a, b) => faixaDeIdade(a.vaga.CreatedAt, agora) - faixaDeIdade(b.vaga.CreatedAt, agora) || b.score - a.score)
        .map(({ vaga, score }) => ({
            id: vaga.Id, title: vaga.JobTitle, createdAt: vaga.CreatedAt, matchScore: score, url: vaga.url,
            description: semContato(vaga.Description)?.slice(0, PREVIEW_CHARS) ?? null,
        }));
}

let vagas = [];
let maiorId = 0;
let checadoEm = 0;
let carregando = null;

async function atualizar() {
    const posts = await sql`
        select "Id", "LinkedinId", "Url", left("Content", 3000) as "Content", "PostedAt", "CreatedAt"
        from "ScrapedPosts"
        where "Id" > ${maiorId} and "CreatedAt" > now() - make_interval(days => ${DIAS_DE_VAGA})
          and coalesce("Status", '') <> 'rejected'
          and "Content" !~* ${EMAIL_SQL} and "Content" ~* ${LINK_SQL}
        order by "Id" desc limit ${TETO_DE_POSTS}`;
    if (posts.length) {
        maiorId = Math.max(maiorId, ...posts.map((p) => Number(p.Id)));
        vagas = semRepetidas([...vagas, ...posts.map(vagaDoPost).filter(Boolean)]);
    }
    checadoEm = Date.now();
}

/** Uma falha ao atualizar não derruba a tela: serve o que já tem. */
async function vagasAtuais() {
    if (Date.now() - checadoEm > ATUALIZA_MS) {
        carregando ??= atualizar()
            .catch((e) => console.error('vagas por link não atualizaram:', e.message))
            .finally(() => { carregando = null; });
        await carregando;
    }
    return vagas;
}

export async function vagasPorLinkDe(userId) {
    const [perfil] = await sql`select * from "Profiles" where "UserId" = ${userId}`;
    const lista = vagasParaPerfil(await vagasAtuais(), perfil || null);
    return { vagas: lista.slice(0, TETO_DA_RESPOSTA), total: lista.length };
}
