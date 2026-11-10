import sql from '../lib/sql.js';
import { config } from '../config.js';
import { getCvBuffer } from '../lib/cvStorage.js';
import { pdfToText } from './pdfText.js';
import { getMatches } from './jobsQuery.js';
import {
    SISTEMA, mensagemDoUsuario, lerResposta, palavrasDoFeed, analisesRestantes,
    LIMITE_ANALISES, MIN_TEXTO_CV,
} from './analiseCvLogic.js';

// =========================
// Análise e reescrita do currículo (Meu perfil › Melhorar meu currículo)
// =========================
// A lógica de prompt e de leitura da resposta fica em analiseCvLogic.js (pura).
// Aqui: a tabela, a cota de LIMITE_ANALISES por pessoa e a chamada à OpenAI.
//
// Funciona antes da migration 0024: sem a tabela, a tela some (disponivel: false).

// gpt-5.4-mini: bom em texto e menos de US$ 0,01 por análise (10/11/2026). O dono
// paga a OpenAI; CV_AI_MODEL troca o modelo sem deploy de código.
const MODELO = process.env.CV_AI_MODEL || 'gpt-5.4-mini';
const TEMPO_MAXIMO_MS = 100_000; // o nginx espera 120 s pelo /api

export class AnaliseError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

let disponivel = null;
let checadoEm = 0;
export async function analiseDisponivel() {
    if (!sql || !config.ai.providers.openai.configured) return false;
    if (disponivel === true) return true;
    if (disponivel === false && Date.now() - checadoEm < 60_000) return false;
    const [r] = await sql`select to_regclass('public."CvAnalyses"') is not null as ok`;
    disponivel = !!r.ok;
    checadoEm = Date.now();
    return disponivel;
}

async function contarUsadas(userId) {
    const [r] = await sql`select count(*)::int as n from "CvAnalyses" where "UserId" = ${userId}`;
    return r.n;
}

/** O que a tela precisa: se existe, quantas restam e a última análise. */
export async function estadoDaAnalise(userId, { admin = false } = {}) {
    if (!(await analiseDisponivel())) return { disponivel: false };
    const usadas = await contarUsadas(userId);
    const [ultima] = await sql`
        select "Id", "CreatedAt", "Result" from "CvAnalyses"
        where "UserId" = ${userId} order by "CreatedAt" desc limit 1`;
    const restantes = analisesRestantes(usadas, { admin });
    return {
        disponivel: true, limite: LIMITE_ANALISES, usadas,
        restantes: Number.isFinite(restantes) ? restantes : null, // null = sem limite (admin)
        ultima: ultima ? { id: ultima.Id, criadaEm: ultima.CreatedAt, ...ultima.Result } : null,
    };
}

async function chamarOpenAI(mensagem) {
    const { apiKey, baseUrl } = config.ai.providers.openai;
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), TEMPO_MAXIMO_MS);
    try {
        const r = await fetch(baseUrl, {
            method: 'POST',
            signal: controle.signal,
            headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: MODELO,
                messages: [{ role: 'system', content: SISTEMA }, { role: 'user', content: mensagem }],
                response_format: { type: 'json_object' },
                reasoning_effort: 'low',
                max_completion_tokens: 8000,
            }),
        });
        const data = await r.json().catch(() => null);
        if (!r.ok) {
            console.warn(`analise-cv: OpenAI ${r.status}: ${String(data?.error?.message || '').slice(0, 200)}`);
            throw new AnaliseError('A análise não saiu agora. Tente de novo em alguns minutos: esta tentativa não foi contada.', 502);
        }
        return data?.choices?.[0]?.message?.content || '';
    } catch (e) {
        if (e instanceof AnaliseError) throw e;
        console.warn(`analise-cv: falhou: ${e.name === 'AbortError' ? 'tempo esgotado' : e.message}`);
        throw new AnaliseError('A análise demorou demais. Tente de novo: esta tentativa não foi contada.', 504);
    } finally {
        clearTimeout(timer);
    }
}

// Uma análise por vez por pessoa (o processo é um só): dois cliques seguidos
// passariam juntos pela contagem e gastariam dois usos.
const emAndamento = new Set();

export async function analisarCurriculo(userId, { admin = false } = {}) {
    if (!(await analiseDisponivel())) throw new AnaliseError('A análise de currículo não está disponível agora.', 503);
    if (emAndamento.has(userId)) throw new AnaliseError('Sua análise já está sendo feita. Aguarde.', 409);
    emAndamento.add(userId);
    try {
        if (analisesRestantes(await contarUsadas(userId), { admin }) <= 0) {
            throw new AnaliseError(`Você já usou as ${LIMITE_ANALISES} análises do teste.`, 429);
        }
        const [perfil] = await sql`select "CvPath", "Areas", "Levels" from "Profiles" where "UserId" = ${userId}`;
        if (!perfil?.CvPath) throw new AnaliseError('Anexe seu currículo em PDF no perfil antes de analisar.', 400);

        const textoCv = (await pdfToText(await getCvBuffer(perfil.CvPath)).catch(() => '')).trim();
        if (textoCv.length < MIN_TEXTO_CV) {
            throw new AnaliseError('Não conseguimos ler o texto do seu PDF. Ele parece ser uma imagem: exporte o currículo como PDF de texto (no Word ou no Google Docs, "Salvar como PDF") e anexe de novo.', 422);
        }

        const palavras = palavrasDoFeed(await getMatches(userId).catch(() => []));
        const resultado = lerResposta(await chamarOpenAI(mensagemDoUsuario(textoCv, perfil, palavras)), textoCv);
        if (!resultado) throw new AnaliseError('A resposta da análise veio incompleta. Tente de novo: esta tentativa não foi contada.', 502);

        const [linha] = await sql`
            insert into "CvAnalyses" ("UserId", "Model", "Result")
            values (${userId}, ${MODELO}, ${sql.json(resultado)})
            returning "Id", "CreatedAt"`;
        return { id: linha.Id, criadaEm: linha.CreatedAt, ...resultado };
    } finally {
        emAndamento.delete(userId);
    }
}
