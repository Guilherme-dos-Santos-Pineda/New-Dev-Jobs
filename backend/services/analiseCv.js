import sql from '../lib/sql.js';
import { config } from '../config.js';
import { getCvBuffer } from '../lib/cvStorage.js';
import { pdfToText } from './pdfText.js';
import { getMatches } from './jobsQuery.js';
import {
    SISTEMA, mensagemDoUsuario, lerResposta, palavrasDoFeed, analisesRestantes,
    MIN_TEXTO_CV, lerControle, acessoLiberado, LIMITE_MAXIMO, EXTRAS_MAXIMO,
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

// =========================
// Controle do admin (migration 0025): chave geral, limite e ajuste por pessoa
// =========================
// Sem a migration, vale o padrão (ligada, limite 3, ninguém bloqueado) e o
// painel avisa que ela falta. Cada pedaço é checado à parte.
let tabelasControle = null;
let tabelasChecadasEm = 0;
async function tabelas() {
    const t = tabelasControle;
    if (t && t.settings && t.ajustes && t.tokens) return t;
    if (t && Date.now() - tabelasChecadasEm < 60_000) return t;
    const [r] = await sql`
        select to_regclass('public."AppSettings"') is not null as settings,
               to_regclass('public."CvAnaliseAjustes"') is not null as ajustes,
               exists (select 1 from information_schema.columns
                       where table_schema = 'public' and table_name = 'CvAnalyses' and column_name = 'TokensIn') as tokens`;
    tabelasControle = { settings: !!r.settings, ajustes: !!r.ajustes, tokens: !!r.tokens };
    tabelasChecadasEm = Date.now();
    return tabelasControle;
}

// O processo é um só: o cache dura 30 s e o admin, ao gravar, já o troca na hora.
let controleCache = null;
let controleLidoEm = 0;
export async function controleGlobal() {
    if (controleCache && Date.now() - controleLidoEm < 30_000) return controleCache;
    let valor;
    if ((await tabelas()).settings) {
        const [r] = await sql`select "Value" from "AppSettings" where "Key" = 'analiseCv'`;
        valor = r?.Value;
    }
    controleCache = lerControle(valor);
    controleLidoEm = Date.now();
    return controleCache;
}

async function ajusteDe(userId) {
    if (!(await tabelas()).ajustes) return { bloqueado: false, extras: 0 };
    const [r] = await sql`select "Bloqueado", "Extras" from "CvAnaliseAjustes" where "UserId" = ${userId}`;
    return { bloqueado: !!r?.Bloqueado, extras: r?.Extras || 0 };
}

/** O que vale para esta pessoa agora: acesso, limite e quantas restam. */
async function situacao(userId, admin) {
    const controle = await controleGlobal();
    const ajuste = await ajusteDe(userId);
    const usadas = await contarUsadas(userId);
    const liberado = acessoLiberado({ ativa: controle.ativa, bloqueado: ajuste.bloqueado, admin });
    const restantes = analisesRestantes(usadas, { admin, limite: controle.limite, extras: ajuste.extras, bloqueado: ajuste.bloqueado });
    return { liberado, usadas, restantes, limite: controle.limite + ajuste.extras };
}

/** O que a tela precisa: se existe, quantas restam e a última análise. */
export async function estadoDaAnalise(userId, { admin = false } = {}) {
    if (!(await analiseDisponivel())) return { disponivel: false };
    const s = await situacao(userId, admin);
    // Desligada ou pessoa bloqueada: some do perfil e a página diz "não está disponível".
    if (!s.liberado) return { disponivel: false };
    const [ultima] = await sql`
        select "Id", "CreatedAt", "Result" from "CvAnalyses"
        where "UserId" = ${userId} order by "CreatedAt" desc limit 1`;
    return {
        disponivel: true, limite: s.limite, usadas: s.usadas,
        restantes: Number.isFinite(s.restantes) ? s.restantes : null, // null = sem limite (admin)
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
        return { conteudo: data?.choices?.[0]?.message?.content || '', usage: data?.usage || null };
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
    const inicio = Date.now();
    try {
        const s = await situacao(userId, admin);
        if (!s.liberado) throw new AnaliseError('A análise de currículo não está disponível agora.', 403);
        if (s.restantes <= 0) {
            throw new AnaliseError(`Você já usou as ${s.limite} análises do teste.`, 429);
        }
        const [perfil] = await sql`select "CvPath", "Areas", "Levels" from "Profiles" where "UserId" = ${userId}`;
        if (!perfil?.CvPath) throw new AnaliseError('Anexe seu currículo em PDF no perfil antes de analisar.', 400);

        const textoCv = (await pdfToText(await getCvBuffer(perfil.CvPath)).catch(() => '')).trim();
        if (textoCv.length < MIN_TEXTO_CV) {
            throw new AnaliseError('Não conseguimos ler o texto do seu PDF. Ele parece ser uma imagem: exporte o currículo como PDF de texto (no Word ou no Google Docs, "Salvar como PDF") e anexe de novo.', 422);
        }

        const palavras = palavrasDoFeed(await getMatches(userId).catch(() => []));
        const { conteudo, usage } = await chamarOpenAI(mensagemDoUsuario(textoCv, perfil, palavras));
        const resultado = lerResposta(conteudo, textoCv);
        if (!resultado) throw new AnaliseError('A resposta da análise veio incompleta. Tente de novo: esta tentativa não foi contada.', 502);

        const duracao = Date.now() - inicio;
        const [linha] = (await tabelas()).tokens
            ? await sql`
                insert into "CvAnalyses" ("UserId", "Model", "Result", "TokensIn", "TokensOut", "DurationMs")
                values (${userId}, ${MODELO}, ${sql.json(resultado)},
                        ${usage?.prompt_tokens ?? null}, ${usage?.completion_tokens ?? null}, ${duracao})
                returning "Id", "CreatedAt"`
            : await sql`
                insert into "CvAnalyses" ("UserId", "Model", "Result")
                values (${userId}, ${MODELO}, ${sql.json(resultado)})
                returning "Id", "CreatedAt"`;
        return { id: linha.Id, criadaEm: linha.CreatedAt, ...resultado };
    } catch (e) {
        // Recusa da regra (limite, bloqueio, sem currículo) não é falha da ferramenta.
        if (!(e instanceof AnaliseError) || e.status >= 500 || e.status === 422) anotarFalha(userId, e);
        throw e;
    } finally {
        emAndamento.delete(userId);
    }
}

// =========================
// Painel do admin (Admin › Currículo IA)
// =========================
// Falha não vira linha no banco (não gasta uso), então fica em memória: o painel
// mostra as do processo atual, que recomeça a cada deploy.
const falhas = [];
let falhasDesdeBoot = 0;
const bootEm = new Date();
function anotarFalha(userId, e) {
    falhasDesdeBoot += 1;
    falhas.unshift({ em: new Date(), userId, status: e.status || 500, motivo: String(e.message || '').slice(0, 200) });
    falhas.length = Math.min(falhas.length, 20);
}

/** Números, controle e saúde, para o topo do painel. Consultas sequenciais (regra do pool). */
export async function painelAdmin() {
    const disponivel = await analiseDisponivel();
    const t = disponivel ? await tabelas() : { settings: false, ajustes: false, tokens: false };
    const controle = disponivel ? await controleGlobal() : lerControle();
    let numeros = null;
    if (disponivel) {
        const tokens = t.tokens
            ? sql`coalesce(sum("TokensIn"), 0)::bigint as tokens_in, coalesce(sum("TokensOut"), 0)::bigint as tokens_out,
                  count("TokensIn")::int as com_tokens, round(avg("DurationMs"))::int as duracao_media`
            : sql`0 as tokens_in, 0 as tokens_out, 0 as com_tokens, null::int as duracao_media`;
        const [r] = await sql`
            select count(*)::int as total,
                   count(*) filter (where "CreatedAt" > now() - interval '1 day')::int as dia,
                   count(*) filter (where "CreatedAt" > now() - interval '7 days')::int as semana,
                   count(distinct "UserId")::int as pessoas,
                   round(avg(("Result"->>'score')::numeric))::int as score_medio,
                   ${tokens}
            from "CvAnalyses"`;
        const [esgotadas] = await sql`
            select count(*)::int as n from (
                select "UserId" from "CvAnalyses" group by "UserId" having count(*) >= ${controle.limite}
            ) x`;
        numeros = {
            total: r.total, ultimas24h: r.dia, ultimos7d: r.semana, pessoas: r.pessoas,
            scoreMedio: r.score_medio, tokensIn: Number(r.tokens_in), tokensOut: Number(r.tokens_out),
            comTokens: r.com_tokens, duracaoMediaMs: r.duracao_media, chegaramNoLimite: esgotadas.n,
        };
    }
    return {
        disponivel, modelo: MODELO, openaiConfigurada: !!config.ai.providers.openai.configured,
        migration: t, controle, numeros, limiteMaximo: LIMITE_MAXIMO, extrasMaximo: EXTRAS_MAXIMO,
        emAndamento: emAndamento.size, falhasDesdeBoot, bootEm, falhas,
    };
}

/** As análises mais recentes, sem o currículo reescrito (é pesado e é dado da pessoa). */
export async function analisesRecentes(limite = 100) {
    if (!(await analiseDisponivel())) return [];
    const extra = (await tabelas()).tokens ? sql`, a."TokensIn", a."TokensOut", a."DurationMs"` : sql``;
    const rows = await sql`
        select a."Id", a."UserId", a."CreatedAt", a."Model", (a."Result"->>'score')::int as score,
               u."Name", u."Email" ${extra}
        from "CvAnalyses" a join "Users" u on u."Id" = a."UserId"
        order by a."CreatedAt" desc limit ${Math.min(300, Math.max(1, limite))}`;
    return rows.map((r) => ({
        id: r.Id, userId: r.UserId, criadaEm: r.CreatedAt, modelo: r.Model, score: r.score, nome: r.Name, email: r.Email,
        tokensIn: r.TokensIn ?? null, tokensOut: r.TokensOut ?? null, duracaoMs: r.DurationMs ?? null,
    }));
}

/** Uma análise inteira: o admin abre para conferir a qualidade da resposta. */
export async function analiseCompleta(id) {
    const [r] = await sql`
        select a."Id", a."UserId", a."CreatedAt", a."Model", a."Result", u."Name", u."Email"
        from "CvAnalyses" a join "Users" u on u."Id" = a."UserId" where a."Id" = ${id}`;
    if (!r) return null;
    return { id: r.Id, userId: r.UserId, criadaEm: r.CreatedAt, modelo: r.Model, nome: r.Name, email: r.Email, ...r.Result };
}

/** Quem usou ou tem ajuste: usadas, extras, bloqueio e quanto resta. Bloqueados primeiro. */
export async function pessoasAdmin() {
    if (!(await analiseDisponivel())) return [];
    const controle = await controleGlobal();
    const rows = (await tabelas()).ajustes
        ? await sql`
            with uso as (
                select "UserId", count(*)::int as usadas, max("CreatedAt") as ultima from "CvAnalyses" group by "UserId"
            )
            select u."Id", u."Name", u."Email", coalesce(uso.usadas, 0) as usadas, uso.ultima,
                   coalesce(aj."Extras", 0) as extras, coalesce(aj."Bloqueado", false) as bloqueado,
                   aj."Motivo", aj."UpdatedBy", aj."UpdatedAt"
            from "Users" u
            left join uso on uso."UserId" = u."Id"
            left join "CvAnaliseAjustes" aj on aj."UserId" = u."Id"
            where uso."UserId" is not null or aj."UserId" is not null
            order by coalesce(aj."Bloqueado", false) desc, uso.ultima desc nulls last
            limit 500`
        : await sql`
            select u."Id", u."Name", u."Email", count(*)::int as usadas, max(a."CreatedAt") as ultima,
                   0 as extras, false as bloqueado, null as "Motivo", null as "UpdatedBy", null as "UpdatedAt"
            from "CvAnalyses" a join "Users" u on u."Id" = a."UserId"
            group by u."Id", u."Name", u."Email" order by ultima desc limit 500`;
    return rows.map((r) => ({
        userId: r.Id, nome: r.Name, email: r.Email, usadas: r.usadas, ultima: r.ultima,
        extras: r.extras, bloqueado: r.bloqueado, motivo: r.Motivo, ajustadoPor: r.UpdatedBy, ajustadoEm: r.UpdatedAt,
        restantes: analisesRestantes(r.usadas, { limite: controle.limite, extras: r.extras, bloqueado: r.bloqueado }),
    }));
}

export async function salvarControle({ ativa, limite }, por) {
    if (!(await tabelas()).settings) throw new AnaliseError('Falta aplicar a migration 0025 para gravar o controle.', 409);
    const atual = await controleGlobal();
    const novo = lerControle({ ativa: ativa ?? atual.ativa, limite: limite ?? atual.limite });
    await sql`
        insert into "AppSettings" ("Key", "Value", "UpdatedBy", "UpdatedAt")
        values ('analiseCv', ${sql.json(novo)}, ${por}, now())
        on conflict ("Key") do update set "Value" = excluded."Value", "UpdatedBy" = excluded."UpdatedBy", "UpdatedAt" = now()`;
    controleCache = novo;
    controleLidoEm = Date.now();
    console.log(`🧾 análise de CV: ${novo.ativa ? 'ligada' : 'DESLIGADA'}, limite ${novo.limite} (por ${por})`);
    return novo;
}

export async function ajustarPessoa({ userId, email }, { bloqueado, extras, motivo }, por) {
    if (!(await tabelas()).ajustes) throw new AnaliseError('Falta aplicar a migration 0025 para bloquear ou dar análises.', 409);
    const [u] = userId
        ? await sql`select "Id", "Email" from "Users" where "Id" = ${userId}`
        : await sql`select "Id", "Email" from "Users" where lower("Email") = ${String(email || '').trim().toLowerCase()}`;
    if (!u) throw new AnaliseError('Nenhuma conta com esse email.', 404);
    const [atual] = await sql`select "Bloqueado", "Extras", "Motivo" from "CvAnaliseAjustes" where "UserId" = ${u.Id}`;
    const novo = {
        bloqueado: bloqueado ?? !!atual?.Bloqueado,
        extras: Math.min(EXTRAS_MAXIMO, Math.max(0, extras ?? atual?.Extras ?? 0)),
        motivo: motivo !== undefined ? (String(motivo || '').trim().slice(0, 300) || null) : (atual?.Motivo ?? null),
    };
    await sql`
        insert into "CvAnaliseAjustes" ("UserId", "Bloqueado", "Extras", "Motivo", "UpdatedBy", "UpdatedAt")
        values (${u.Id}, ${novo.bloqueado}, ${novo.extras}, ${novo.motivo}, ${por}, now())
        on conflict ("UserId") do update set "Bloqueado" = excluded."Bloqueado", "Extras" = excluded."Extras",
            "Motivo" = excluded."Motivo", "UpdatedBy" = excluded."UpdatedBy", "UpdatedAt" = now()`;
    console.log(`🧾 análise de CV: ${u.Email} ${novo.bloqueado ? 'bloqueado' : 'liberado'}, extras ${novo.extras} (por ${por})`);
    return { userId: u.Id, ...novo };
}
