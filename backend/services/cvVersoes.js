import sql from '../lib/sql.js';
import { config } from '../config.js';
import { getCvBuffer } from '../lib/cvStorage.js';
import { pdfToText } from './pdfText.js';
import { getMatches } from './jobsQuery.js';
import { idiomaDaVaga, areaDaVaga, areaForaDeTI } from './classify.js';
import { planOf } from '../config/plans.js';
import { criarCacheLimitado } from '../lib/cacheLimitado.js';
import { curriculoEmPdf, nomeDoAnexo } from './cvPdf.js';
import { MIN_TEXTO_CV } from './analiseCvLogic.js';
import { controleGlobal, ajusteDe } from './analiseCv.js';
import { gruposDoFeed, SISTEMA_VERSAO, mensagemVersao, lerVersao, AREA_LEGIVEL, escolherVersao } from './cvVersoesLogic.js';

// =========================
// Versões do currículo por tipo de vaga (11/11/2026)
// =========================
// Quem tem o plano com IA (`cvVersoes` em config/plans.js) cria uma versão por
// tipo de vaga do feed, confere ao lado das vagas reais e aprova. Dali em
// diante, todo envio para uma vaga desse tipo (área + idioma) leva a versão
// aprovada, em PDF montado aqui (cvPdf.js), no lugar do PDF anexado no perfil.
// Sem versão aprovada para o tipo, vai o PDF do perfil, como sempre.
// O admin vê a tela sem o plano (para testar), mas só o PLANO liga no envio.
export const versoesNosEnvios = (user) => !!planOf(user?.Plan).cvVersoes;

/**
 * Admin › Currículo IA manda aqui: a chave das versões desligada, ou a pessoa
 * bloqueada, tira a aba E o envio com IA (volta o PDF do perfil). O admin
 * continua vendo a aba para testar.
 */
export async function iaLiberada(user) {
    const controle = await controleGlobal().catch(() => ({ versoesAtivas: true }));
    if (!controle.versoesAtivas) return false;
    const ajuste = await ajusteDe(user.Id).catch(() => ({ bloqueado: false }));
    return !ajuste.bloqueado;
}

export async function podeUsarVersoes(user, admin = false) {
    if (admin) return true;
    return versoesNosEnvios(user) && (await iaLiberada(user));
}
const MODELO = process.env.CV_AI_MODEL || 'gpt-5.4-mini';
const TEMPO_MAXIMO_MS = 100_000;

export class VersaoError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

let disponivel = null;
let checadoEm = 0;
async function tabelaExiste() {
    if (!sql) return false;
    if (disponivel === true) return true;
    if (disponivel === false && Date.now() - checadoEm < 60_000) return false;
    const [r] = await sql`select to_regclass('public."CvVersoes"') is not null as ok`;
    disponivel = !!r.ok;
    checadoEm = Date.now();
    return disponivel;
}

const idiomaDoMatch = (m) => idiomaDaVaga({ JobTitle: m.title, Description: m.description, Email: m.email, Location: m.location });
const forma = (v) => ({
    id: v.Id, area: v.Area, areaNome: AREA_LEGIVEL[v.Area] || v.Area, lang: v.Lang, status: v.Status,
    curriculo: v.Curriculo, mudancas: v.Mudancas || [], criadaEm: v.CreatedAt, aprovadaEm: v.AprovadaEm,
});

/** A tela inteira: os tipos de vaga do feed da pessoa e as versões que ela já tem. */
export async function painelDeVersoes(userId, { acesso = false, nosEnvios = false } = {}) {
    if (!acesso) return { disponivel: false };
    // Lido do banco, não do req.user: o middleware guarda o usuário por 60 s e o
    // liga/desliga voltaria ao estado anterior ao recarregar a tela.
    const [u] = await sql`select "CvIaNosEnvios" from "Users" where "Id" = ${userId}`;
    const ligado = u?.CvIaNosEnvios !== false;
    if (!(await tabelaExiste())) return { disponivel: false, faltaMigration: true };
    const grupos = gruposDoFeed(await getMatches(userId).catch(() => []), idiomaDoMatch);
    const versoes = (await sql`select * from "CvVersoes" where "UserId" = ${userId} order by "CreatedAt"`).map(forma);
    return {
        disponivel: true,
        // podeLigar: o plano tem IA nos envios. ligado: a pessoa deixou ligado.
        podeLigar: nosEnvios, ligado, nosEnvios: nosEnvios && ligado,
        grupos: grupos.map((g) => ({
            ...g, areaNome: AREA_LEGIVEL[g.area] || g.area,
            versao: versoes.find((v) => v.area === g.area && v.lang === g.lang) || null,
        })),
        // Versão de um tipo que saiu do feed continua valendo: aparece à parte.
        avulsas: versoes.filter((v) => !grupos.some((g) => g.area === v.area && g.lang === v.lang)),
    };
}

async function chamarOpenAI(mensagem) {
    const { apiKey, baseUrl, configured } = config.ai.providers.openai;
    if (!configured) throw new VersaoError('A IA não está configurada.', 503);
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TEMPO_MAXIMO_MS);
    try {
        const r = await fetch(baseUrl, {
            method: 'POST', signal: controle.signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODELO,
                messages: [{ role: 'system', content: SISTEMA_VERSAO }, { role: 'user', content: mensagem }],
                response_format: { type: 'json_object' }, reasoning_effort: 'low', max_completion_tokens: 8000,
            }),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) {
            console.warn(`cv-versoes: OpenAI ${r.status}: ${String(data?.error?.message || '').slice(0, 200)}`);
            throw new VersaoError('A versão não saiu agora. Tente de novo em alguns minutos.', 502);
        }
        return { conteudo: data?.choices?.[0]?.message?.content || '', usage: data?.usage || null };
    } catch (e) {
        if (e instanceof VersaoError) throw e;
        throw new VersaoError('A versão demorou demais. Tente de novo.', 504);
    } finally {
        clearTimeout(timer);
    }
}

const gerando = new Set();

/** Cria (ou refaz) a versão de um tipo de vaga. Sai como rascunho: a pessoa aprova. */
export async function gerarVersao(userId, { area, lang }, { acesso = false } = {}) {
    if (!acesso) throw new VersaoError('Disponível no plano com IA.', 403);
    if (!(await tabelaExiste())) throw new VersaoError('Falta aplicar a migration 0026.', 409);
    const idioma = lang === 'en' ? 'en' : 'pt';
    if (gerando.has(userId)) throw new VersaoError('Já tem uma versão sendo feita. Aguarde.', 409);
    gerando.add(userId);
    try {
        const grupo = gruposDoFeed(await getMatches(userId).catch(() => []), idiomaDoMatch, 50)
            .find((g) => g.area === area && g.lang === idioma);
        if (!grupo) throw new VersaoError('Não há vagas desse tipo no seu feed para servir de exemplo.', 404);

        const [perfil] = await sql`select "CvPath" from "Profiles" where "UserId" = ${userId}`;
        if (!perfil?.CvPath) throw new VersaoError('Anexe seu currículo em PDF no perfil primeiro.', 400);
        const textoCv = (await pdfToText(await getCvBuffer(perfil.CvPath)).catch(() => '')).trim();
        if (textoCv.length < MIN_TEXTO_CV) throw new VersaoError('Não conseguimos ler o texto do seu PDF.', 422);

        const { conteudo, usage } = await chamarOpenAI(mensagemVersao(textoCv, { area, lang: idioma, exemplos: grupo.exemplos }));
        const v = lerVersao(conteudo, textoCv);
        if (!v) throw new VersaoError('A resposta veio incompleta. Tente de novo.', 502);

        // Refazer volta para rascunho: o que mudou precisa ser aprovado de novo.
        const [linha] = await sql`
            insert into "CvVersoes" ("UserId", "Area", "Lang", "Curriculo", "Mudancas", "Status", "Model", "TokensIn", "TokensOut")
            values (${userId}, ${area}, ${idioma}, ${sql.json(v.curriculo)}, ${sql.json(v.mudancas)}, 'rascunho', ${MODELO},
                    ${usage?.prompt_tokens ?? null}, ${usage?.completion_tokens ?? null})
            on conflict ("UserId", "Area", "Lang") do update set
                "Curriculo" = excluded."Curriculo", "Mudancas" = excluded."Mudancas", "Status" = 'rascunho',
                "Model" = excluded."Model", "TokensIn" = excluded."TokensIn", "TokensOut" = excluded."TokensOut",
                "CreatedAt" = now(), "AprovadaEm" = null
            returning *`;
        return forma(linha);
    } finally {
        gerando.delete(userId);
    }
}

export async function aprovarVersao(userId, id, { acesso = false } = {}) {
    if (!acesso) throw new VersaoError('Disponível no plano com IA.', 403);
    const [v] = await sql`
        update "CvVersoes" set "Status" = 'aprovada', "AprovadaEm" = now()
        where "Id" = ${id} and "UserId" = ${userId} returning *`;
    if (!v) throw new VersaoError('Versão não encontrada.', 404);
    return forma(v);
}

export async function apagarVersao(userId, id, { acesso = false } = {}) {
    if (!acesso) throw new VersaoError('Disponível no plano com IA.', 403);
    const [v] = await sql`delete from "CvVersoes" where "Id" = ${id} and "UserId" = ${userId} returning "Id"`;
    if (!v) throw new VersaoError('Versão não encontrada.', 404);
    return { apagada: true };
}

// PDFs já montados: a mesma versão vai para dezenas de vagas no mesmo dia.
// A chave leva a data da aprovação, então versão refeita é PDF novo.
const pdfs = criarCacheLimitado(8 * 1024 * 1024);

/** Área da vaga como o feed a mostra (fora de TI, pela área do título). */
const areaDoEnvio = (job) => {
    const area = areaDaVaga(job);
    return area === 'nontech' ? areaForaDeTI(job) : area;
};

/**
 * O anexo deste envio, se a pessoa tem o plano com IA e uma versão APROVADA
 * para o tipo da vaga. Qualquer falha devolve null e o envio segue com o PDF do
 * perfil: currículo genérico é melhor que envio parado.
 * @returns {Promise<{ buffer: Buffer, filename: string, versaoId: number, area: string } | null>}
 */
export async function versaoParaEnvio(user, job) {
    try {
        // Desligado pela pessoa (migration 0028): vai o PDF do perfil.
        if (!versoesNosEnvios(user) || user.CvIaNosEnvios === false || !(await tabelaExiste())) return null;
        if (!(await iaLiberada(user))) return null;
        const area = areaDoEnvio(job);
        if (!area || area === 'other') return null;
        const lang = idiomaDaVaga(job);
        const linhas = await sql`select * from "CvVersoes" where "UserId" = ${user.Id} and "Status" = 'aprovada' and "Area" = ${area}`;
        const v = escolherVersao({ area, lang }, linhas.map(forma));
        if (!v) return null;
        const chave = `${v.id}:${new Date(v.aprovadaEm || 0).getTime()}`;
        let buffer = pdfs.ler(chave);
        if (!buffer) {
            buffer = await curriculoEmPdf(v.curriculo, { lang: v.lang });
            pdfs.guardar(chave, buffer);
        }
        const nome = `${v.areaNome}${v.lang === 'en' ? ' (inglês)' : ''}`;
        return { buffer, filename: nomeDoAnexo(v.curriculo?.nome || user.Name), versaoId: v.id, area, nome };
    } catch (e) {
        console.warn(`cv-versoes: envio segue com o PDF do perfil (${e.message})`);
        return null;
    }
}

/** Liga/desliga a versão da IA nos envios. Só para quem tem o plano com IA. */
export async function ligarIaNosEnvios(user, ligado) {
    if (!versoesNosEnvios(user)) throw new VersaoError('Disponível no plano Automático + IA.', 403);
    const [u] = await sql`update "Users" set "CvIaNosEnvios" = ${!!ligado} where "Id" = ${user.Id} returning "CvIaNosEnvios"`;
    return { ligado: u.CvIaNosEnvios };
}
