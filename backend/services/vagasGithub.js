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
    for (const repo of REPOS_DE_VAGAS) {
        try {
            for (const issue of await issuesDoRepo(repo, desde)) {
                const item = issueParaPost(issue, repo);
                if (item) itens.push(item);
            }
        } catch (e) {
            erros.push(e.message); // um repositório fora não derruba os outros
        }
    }
    const s = await processarPosts(itens, { fonte: 'github' });
    s.fonte = 'github';
    if (erros.length) s.erros = erros;
    if (runId) await sql`update "ScraperRuns" set "Stats" = ${sql.json(s)} where "Id" = ${runId}`;
    return s;
}

// Chamado a cada minuto pelo agendador; só lê de 6 em 6 horas. A última leitura
// vem de ScraperRuns, então reiniciar o serviço não faz ler de novo.
let rodando = false;
export async function tickVagasGithub() {
    if (rodando) return;
    rodando = true;
    let runId = null;
    try {
        const [ultima] = await sql`
            select "CreatedAt" from "ScraperRuns"
            where "Params"->>'fonte' = 'github'
            order by "CreatedAt" desc limit 1`;
        if (ultima && Date.now() - new Date(ultima.CreatedAt).getTime() < A_CADA_MS) return;
        const [run] = await sql`
            insert into "ScraperRuns" ("Type", "Status", "Params", "StartedAt")
            values ('monitoring', 'running', ${sql.json({ fonte: 'github', scheduleName: 'Vagas do GitHub' })}, now())
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
