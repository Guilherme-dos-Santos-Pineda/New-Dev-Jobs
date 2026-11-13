import sql from '../lib/sql.js';
import { processarPosts } from './scraper.js';
import { REPOS_DE_VAGAS, issueParaPost } from './vagasGithubLogic.js';

// Leitor de vagas dos repositórios de comunidade no GitHub (ver vagasGithubLogic.js).
// Roda pelo worker (tickVagasGithub), FORA do agendador dos robôs: não gasta
// crédito da Apify, não entra no teto diário e não para quando a Apify para.

const A_CADA_MS = 6 * 3600 * 1000;
const DIAS = 7; // janela de cada leitura; o dedup por LinkedinId evita repetir

async function issuesDoRepo(repo, desde) {
    const headers = { 'User-Agent': 'newdevjobs', Accept: 'application/vnd.github+json' };
    // Sem token a API dá 60 chamadas por hora por IP; cada leitura usa ~8.
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const url = `https://api.github.com/repos/${repo}/issues?state=open&since=${desde.toISOString()}&per_page=100&sort=created&direction=desc`;
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`${repo}: HTTP ${r.status}`);
    const lista = await r.json();
    // `since` filtra por atualização; a vaga tem de ter sido CRIADA na janela.
    return lista.filter((i) => new Date(i.created_at) >= desde);
}

// Lê os repositórios e grava as vagas com email. `dias` maior serve para a
// primeira carga. Devolve as estatísticas do processarPosts mais os erros.
export async function runVagasGithub({ dias = DIAS, runId = null } = {}) {
    const desde = new Date(Date.now() - dias * 864e5);
    const itens = [];
    const erros = [];
    const porRepo = {}; // o painel mostra quantas issues cada repo teve e quantas tinham email de candidatura
    for (const repo of REPOS_DE_VAGAS) {
        try {
            const issues = await issuesDoRepo(repo, desde);
            porRepo[repo] = { issues: issues.length, comEmail: 0 };
            for (const issue of issues) {
                const item = issueParaPost(issue, repo);
                if (item) { itens.push(item); porRepo[repo].comEmail += 1; }
            }
        } catch (e) {
            erros.push(e.message); // um repositório fora não derruba os outros
            porRepo[repo] = { erro: e.message };
        }
    }
    // Issue já lida não volta para a IA. A janela é de 7 dias e a leitura é de
    // 6 em 6 horas: sem isso, cada vaga seria analisada até 28 vezes.
    const ids = itens.map((i) => i.id);
    const lidos = new Set(ids.length
        ? (await sql`select "LinkedinId" from "ScrapedPosts" where "LinkedinId" = any(${ids}::text[])`).map((r) => r.LinkedinId)
        : []);
    const s = await processarPosts(itens.filter((i) => !lidos.has(i.id)), { fonte: 'github' });
    s.jaLidos = lidos.size;
    s.fonte = 'github';
    s.dias = dias;
    s.porRepo = porRepo;
    if (erros.length) s.erros = erros;
    if (runId) await sql`update "ScraperRuns" set "Stats" = ${sql.json(s)} where "Id" = ${runId}`;
    return s;
}

// Chamado a cada minuto pelo agendador; só lê de 6 em 6 horas. A última leitura
// vem de ScraperRuns, então reiniciar o serviço não faz ler de novo.
// `forcar` (botão "Ler agora" do admin) ignora o intervalo.
let rodando = false;
export const githubRodando = () => rodando;
export async function tickVagasGithub({ forcar = false, por = null } = {}) {
    if (rodando) return;
    rodando = true;
    let runId = null;
    try {
        const [ultima] = await sql`
            select "CreatedAt" from "ScraperRuns"
            where "Params"->>'fonte' = 'github'
            order by "CreatedAt" desc limit 1`;
        if (!forcar && ultima && Date.now() - new Date(ultima.CreatedAt).getTime() < A_CADA_MS) return;
        const [run] = await sql`
            insert into "ScraperRuns" ("Type", "Status", "Params", "StartedAt")
            values ('monitoring', 'running', ${sql.json({ fonte: 'github', scheduleName: 'Vagas do GitHub', ...(por ? { por } : {}) })}, now())
            returning "Id"`;
        runId = Number(run.Id);
        const s = await runVagasGithub({ runId });
        await sql`update "ScraperRuns" set "Status" = 'done', "FinishedAt" = now() where "Id" = ${runId}`;
        if (s.novos) console.log(`🐙 GitHub: ${s.novos} vaga(s) nova(s) de ${s.found} com email`);
    } catch (e) {
        console.error('tickVagasGithub falhou:', e.message);
        if (runId) await sql`update "ScraperRuns" set "Status" = 'failed', "Error" = ${e.message}, "FinishedAt" = now() where "Id" = ${runId}`.catch(() => {});
    } finally {
        rodando = false;
    }
}

// Admin › GitHub: "o leitor está trazendo vaga, e alguém está usando?".
// Consultas SEQUENCIAIS (regra do pool) e todas pequenas: as vagas do GitHub
// são dezenas, e os filtros usam "LinkedinId" like 'github:%'.
export async function painelGithub() {
    const leituras = await sql`
        select "Id", "Status", "Stats", "Error", "Params"->>'por' as por, "CreatedAt", "FinishedAt"
        from "ScraperRuns" where "Params"->>'fonte' = 'github'
        order by "CreatedAt" desc limit 12`;
    const [tot] = await sql`
        select
            count(*)::int as total,
            count(*) filter (where "CreatedAt" > now() - interval '30 days')::int as mes,
            count(*) filter (where "CreatedAt" > now() - interval '7 days')::int as semana
        from "Jobs" where "LinkedinId" like 'github:%'`;
    const [env] = await sql`
        select count(*)::int as envios, count(distinct a."UserId")::int as pessoas
        from "Applications" a join "Jobs" j on j."Id" = a."JobId"
        where j."LinkedinId" like 'github:%'`;
    const vagas = await sql`
        select j."Id", j."JobTitle", j."Company", j."Area", j."Level", j."IsBR", j."CreatedAt", j."LinkedinId",
               p."Url",
               (select count(*)::int from "Applications" a where a."JobId" = j."Id") as envios
        from "Jobs" j
        left join "ScrapedPosts" p on p."LinkedinId" = j."LinkedinId"
        where j."LinkedinId" like 'github:%'
        order by j."CreatedAt" desc limit 50`;
    // Issues que a IA leu e NÃO viraram vaga (descartada, duplicada, sem email válido).
    const [{ descartadas }] = await sql`
        select count(*)::int as descartadas from "ScrapedPosts" p
        where p."Source" = 'github'
          and not exists (select 1 from "Jobs" j where j."LinkedinId" = p."LinkedinId")`;

    const ultima = leituras[0] || null;
    const ultimaOk = leituras.find((l) => l.Status === 'done') || null;
    return {
        repos: REPOS_DE_VAGAS,
        aCadaHoras: A_CADA_MS / 3600e3,
        rodandoAgora: rodando,
        proxima: ultima ? new Date(new Date(ultima.CreatedAt).getTime() + A_CADA_MS) : null,
        // O retrato por repositório vem da última leitura que terminou.
        porRepo: ultimaOk?.Stats?.porRepo || {},
        totais: { ...tot, ...env, descartadas },
        leituras: leituras.map((l) => ({
            id: Number(l.Id), status: l.Status, em: l.CreatedAt, fim: l.FinishedAt, erro: l.Error, por: l.por,
            issues: l.Stats?.found ?? null, novos: l.Stats?.novos ?? 0, jaLidos: l.Stats?.jaLidos ?? 0,
            ia: l.Stats?.aiUsed ?? 0, dias: l.Stats?.dias ?? null, erros: l.Stats?.erros || [],
        })),
        vagas: vagas.map((v) => ({
            id: Number(v.Id), titulo: v.JobTitle, empresa: v.Company, area: v.Area, nivel: v.Level, br: v.IsBR,
            em: v.CreatedAt, envios: v.envios,
            repo: v.LinkedinId.replace(/^github:/, '').replace(/#\d+$/, ''),
            url: v.Url,
        })),
    };
}
