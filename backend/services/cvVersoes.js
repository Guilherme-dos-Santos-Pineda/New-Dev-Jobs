import sql from '../lib/sql.js';
import { config } from '../config.js';
import { getCvBuffer } from '../lib/cvStorage.js';
import { pdfToText } from './pdfText.js';
import { getMatches } from './jobsQuery.js';
import { idiomaDaVaga } from './classify.js';
import { MIN_TEXTO_CV } from './analiseCvLogic.js';
import { gruposDoFeed, SISTEMA_VERSAO, mensagemVersao, lerVersao, AREA_LEGIVEL } from './cvVersoesLogic.js';

// =========================
// Versões do currículo por área (PROTÓTIPO, 11/11/2026: não publicado)
// =========================
// Só admin enquanto o plano que vai oferecer isso não existe. As versões ainda
// NÃO entram nos envios: a pessoa vê, compara com as vagas e aprova. Ligar no
// envio é o passo seguinte (escolherVersao em cvVersoesLogic.js já decide qual).
export const SO_ADMIN = true;
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
export async function painelDeVersoes(userId, { admin = false } = {}) {
    if (SO_ADMIN && !admin) return { disponivel: false };
    if (!(await tabelaExiste())) return { disponivel: false, faltaMigration: true };
    const grupos = gruposDoFeed(await getMatches(userId).catch(() => []), idiomaDoMatch);
    const versoes = (await sql`select * from "CvVersoes" where "UserId" = ${userId} order by "CreatedAt"`).map(forma);
    return {
        disponivel: true,
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
export async function gerarVersao(userId, { area, lang }, { admin = false } = {}) {
    if (SO_ADMIN && !admin) throw new VersaoError('Ainda não disponível.', 403);
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

export async function aprovarVersao(userId, id, { admin = false } = {}) {
    if (SO_ADMIN && !admin) throw new VersaoError('Ainda não disponível.', 403);
    const [v] = await sql`
        update "CvVersoes" set "Status" = 'aprovada', "AprovadaEm" = now()
        where "Id" = ${id} and "UserId" = ${userId} returning *`;
    if (!v) throw new VersaoError('Versão não encontrada.', 404);
    return forma(v);
}

export async function apagarVersao(userId, id, { admin = false } = {}) {
    if (SO_ADMIN && !admin) throw new VersaoError('Ainda não disponível.', 403);
    const [v] = await sql`delete from "CvVersoes" where "Id" = ${id} and "UserId" = ${userId} returning "Id"`;
    if (!v) throw new VersaoError('Versão não encontrada.', 404);
    return { apagada: true };
}
