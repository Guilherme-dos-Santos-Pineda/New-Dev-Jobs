import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';
import { runMonitoring } from './scraper.js';
import { getMatches } from './jobsQuery.js';
import { contaPagantesDisponivel, apifyUsage, temFolgaDeCredito } from './apifyPool.js';
import { config } from '../config.js';
import {
    consultasPessoais, proximaBusca, diasDeEstoque, ordemDeAtendimento,
    POSTS_POR_CONSULTA, PESSOAS_POR_DIA, RODAR_A_CADA_DIAS,
} from './roboPessoalLogic.js';

// =========================
// Um robô por pagante (12/11/2026): a parte com banco e Apify
// =========================
// A regra (buscas, janela, ordem) está em roboPessoalLogic.js. Aqui:
//   - quem paga, o estoque de cada um e o histórico do robô dele (ScraperRuns com
//     Params.pagante = id, FORA do teto diário dos robôs gerais: worker.js);
//   - roda às 5h de Brasília, antes do envio das 9h, quem tem menos vaga primeiro;
//   - usa a conta da Apify dos pagantes (APIFY_TOKEN_PAGANTES). Sem ela, usa o pool
//     só se sobrar crédito (o monitoramento geral vem antes).
// O robô diário antigo ("Vagas de quem comprou", roboDoPlano.js) continua visitando
// os recrutadores mais ativos das áreas dos pagantes.

const HORA_UTC = 8; // 5h em Brasília
const CREDITO_MINIMO_POOL = 3;
const DIA_MS = 86400000;

const lista = (v) => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};

async function pagantes() {
    const linhas = await sql`
        select u."Id", u."Name", u."Plan", u."PlanExpiresAt", u."AutoEnvio",
               p."Areas", p."Levels", p."Region"
        from "Users" u join "Profiles" p on p."UserId" = u."Id"
        where u."Plan" <> 'free' and (u."PlanExpiresAt" is null or u."PlanExpiresAt" > now())
        order by u."PlanExpiresAt" asc nulls last limit 200`;
    return linhas.filter((p) => planOf(p.Plan).autoSend);
}

async function historicoDe(userId) {
    const runs = await sql`
        select "Id", "Status", "CreatedAt", "FinishedAt", "Stats", "Error", "Params"->>'postedLimit' as janela
        from "ScraperRuns" where "Params"->>'pagante' = ${String(userId)}
        order by "CreatedAt" desc limit 10`;
    const ok = runs.filter((r) => r.Status !== 'failed');
    return {
        runs,
        ultima: ok[0]?.CreatedAt || null,
        ultimaProfunda: ok.find((r) => r.janela === 'month')?.CreatedAt || null,
    };
}

/** Estoque e ritmo de envio da pessoa: o que decide quem é atendido primeiro. */
async function situacaoDe(p, agora = Date.now()) {
    let estoque = null, semana = null;
    try {
        const m = await getMatches(p.Id);
        estoque = m.length;
        semana = m.filter((x) => agora - new Date(x.createdAt).getTime() <= 7 * DIA_MS).length;
    } catch { /* sem feed agora: a pessoa vai para o fim da fila */ }
    const [e] = await sql`select count(*)::int n from "Applications" where "UserId" = ${p.Id} and "SentAt" > now() - interval '7 days'`;
    // Com o automático ligado, o ritmo é o limite do dia (é isso que vai sair); senão, o que ela mandou.
    const enviosPorDia = p.AutoEnvio ? planOf(p.Plan).dailyLimit : e.n / 7;
    return { estoque, semana, enviosPorDia: Math.round(enviosPorDia * 10) / 10, dias: estoque == null ? null : diasDeEstoque(estoque, enviosPorDia) };
}

const rodando = new Set();

/** Roda o robô de uma pessoa. `forcar` (botão do admin) ignora o intervalo de 6 dias. */
export async function rodarRoboDe(userId, { forcar = false, por = 'agendador' } = {}) {
    if (rodando.has(userId)) return { pulado: 'já está rodando' };
    const [p] = (await pagantes()).filter((x) => x.Id === userId);
    if (!p) return { pulado: 'sem plano ativo' };
    const h = await historicoDe(userId);
    const prox = proximaBusca({ ultima: h.ultima, ultimaProfunda: h.ultimaProfunda, forcar });
    if (!prox.rodar) return { pulado: 'ainda não é dia' };

    let conta = null;
    if (contaPagantesDisponivel()) conta = 'pagantes';
    else if (!temFolgaDeCredito(await apifyUsage().catch(() => null), CREDITO_MINIMO_POOL)) return { pulado: 'sem crédito na Apify' };

    const consultas = consultasPessoais(p);
    const params = { pagante: String(userId), nome: p.Name, postedLimit: prox.janela, consultas, conta: conta || 'pool', por };
    const [run] = await sql`
        insert into "ScraperRuns" ("Type", "Status", "Params", "StartedAt")
        values ('monitoring', 'running', ${sql.json(params)}, now()) returning "Id"`;
    rodando.add(userId);
    try {
        const stats = await runMonitoring({
            source: 'global', queries: consultas, maxPosts: POSTS_POR_CONSULTA, contentType: 'all',
            postedLimit: prox.janela, sortBy: 'date', region: p.Region === 'br' ? 'br' : 'global', runId: run.Id, conta,
        });
        await sql`update "ScraperRuns" set "Status" = 'done', "Stats" = ${sql.json(stats)}, "FinishedAt" = now() where "Id" = ${run.Id}`;
        console.log(`🤖 robô de ${p.Name || userId}: ${stats.found} posts, ${stats.novos} vagas novas (${prox.janela}, conta ${conta || 'pool'})`);
        return { ok: true, stats };
    } catch (e) {
        await sql`update "ScraperRuns" set "Status" = 'failed', "Error" = ${String(e.message || 'erro').slice(0, 300)}, "FinishedAt" = now() where "Id" = ${run.Id}`;
        console.warn(`robô de ${p.Name || userId} falhou: ${e.message}`);
        return { erro: e.message };
    } finally {
        rodando.delete(userId);
    }
}

let concluidoEm = '';
let emCurso = false;

/** Chamado a cada minuto pelo worker. Roda uma vez por dia, às 5h de Brasília. */
export async function tickRobosPessoais(agora = Date.now()) {
    const dia = new Date(agora).toISOString().slice(0, 10);
    if (emCurso || concluidoEm === dia || new Date(agora).getUTCHours() < HORA_UTC) return;
    if (!config.apify.postActorId) return;
    emCurso = true;
    try {
        const pessoas = [];
        for (const p of await pagantes()) {
            const h = await historicoDe(p.Id);
            if (!proximaBusca({ ultima: h.ultima, ultimaProfunda: h.ultimaProfunda }, agora).rodar) continue;
            pessoas.push({ id: p.Id, ...(await situacaoDe(p, agora)) });
        }
        for (const p of ordemDeAtendimento(pessoas).slice(0, PESSOAS_POR_DIA)) {
            const r = await rodarRoboDe(p.id);
            if (r.pulado === 'sem crédito na Apify') break;
        }
        concluidoEm = dia;
    } finally {
        emCurso = false;
    }
}

/** Admin › Robô dos pagantes: uma linha por pessoa, com o robô dela. */
export async function painelRobosPessoais(agora = Date.now()) {
    const pessoas = [];
    for (const p of await pagantes()) {
        const h = await historicoDe(p.Id);
        const prox = proximaBusca({ ultima: h.ultima, ultimaProfunda: h.ultimaProfunda }, agora);
        const s = await situacaoDe(p, agora);
        const u = h.runs[0];
        pessoas.push({
            userId: p.Id, nome: p.Name, plano: planOf(p.Plan).label || p.Plan, ate: p.PlanExpiresAt, autoEnvio: !!p.AutoEnvio,
            areas: lista(p.Areas), niveis: lista(p.Levels), ...s,
            consultas: consultasPessoais(p), proxima: prox.proxima, janela: prox.janela, rodandoAgora: rodando.has(p.Id),
            ultima: u ? {
                em: u.CreatedAt, status: u.Status, janela: u.janela, posts: u.Stats?.found ?? null,
                vagasNovas: u.Stats?.novos ?? null, recrutadoresNovos: u.Stats?.recrutadoresAdd ?? null, erro: u.Error || null,
            } : null,
            totalVagasDoRobo: h.runs.reduce((soma, r) => soma + (r.Stats?.novos || 0), 0),
        });
    }
    return {
        contaPagantes: { configurada: !!config.apify.tokenPagantes, disponivel: contaPagantesDisponivel() },
        rodarACadaDias: RODAR_A_CADA_DIAS,
        pessoas: ordemDeAtendimento(pessoas),
    };
}
