import sql from '../lib/sql.js';
import { runActor, apifyUsage, temFolgaDeCredito } from './apifyPool.js';

// =========================
// Vagas anunciadas no LinkedIn Jobs
// =========================
// Recrutador que posta vaga com email quase não anuncia front-end: medido em
// 08/11/2026, 13 vagas de front em 30 dias, com 46 perfis pedindo front. Elas estão
// na área de vagas do LinkedIn, e um teste de US$ 0,035 trouxe 59 de front em uma
// semana (53 no Brasil). Meta do dono: 100 a 300 vagas de TI por dia e 200 das
// outras áreas.
//
// A vaga anunciada não tem email: a candidatura é pelo link. Por isso ela vai para
// "ScrapedPosts" com Source = FONTE e aparece em Vagas por link (vagasPorLink.js),
// sem migration e sem tocar no envio. A retenção de 45 dias limpa sozinha.
//
// Preço do ator (08/11/2026): US$ 0,0001 por vaga só com título, empresa e local,
// e US$ 0,00035 com a descrição. Só front leva descrição, que é onde mais falta.
// Uma execução faz QUATRO chamadas à Apify (uma por busca): o teto do agendador
// conta execuções, então o custo é limitado aqui, pelo `max` de cada busca.

export const ATOR_VAGAS = 'worldunboxer~rapid-linkedin-scraper';
export const FONTE = 'vaga-linkedin';
export const ROBO_DAS_VAGAS = 'Vagas anunciadas no LinkedIn';

export const BUSCAS = [
    {
        nome: 'ti-brasil', local: 'Brazil', descricao: false, max: 500,
        titulos: ['Desenvolvedor', 'Software Engineer', 'Back-end', 'Full Stack', 'Mobile Developer', 'Engenheiro de Dados',
            'Analista de Dados', 'QA', 'DevOps', 'Analista de Suporte', 'Analista de Sistemas', 'Product Owner',
            'UX Designer', 'SAP', 'Estágio TI', 'Desenvolvedor Júnior'],
    },
    {
        nome: 'front-brasil', local: 'Brazil', descricao: true, max: 80,
        titulos: ['Front-end', 'Desenvolvedor Front-end', 'Frontend Developer', 'React Developer', 'Angular Developer'],
    },
    {
        nome: 'ti-america-latina', local: 'Latin America', descricao: false, max: 150,
        titulos: ['Frontend Developer', 'Backend Developer', 'Full Stack Developer', 'Software Engineer', 'Mobile Developer', 'Data Engineer'],
    },
    {
        nome: 'outras-brasil', local: 'Brazil', descricao: false, max: 300,
        titulos: ['Assistente Administrativo', 'Analista Financeiro', 'Recursos Humanos', 'Vendedor', 'Representante Comercial',
            'Atendimento ao Cliente', 'Marketing', 'Social Media', 'Analista de Logística', 'Comprador'],
    },
];

/** Uma vaga do ator no formato de "ScrapedPosts", ou null se faltar o essencial. */
export function linhaDaVaga(item) {
    const id = String(item.job_id || '').replace(/\D/g, '');
    const titulo = String(item.job_title || '').trim();
    const url = String(item.job_url || '').split('?')[0];
    if (!id || !titulo || !/^https:\/\/([a-z]+\.)?linkedin\.com\//.test(url)) return null;
    const empresa = String(item.company_name || '').trim();
    const local = String(item.location || '').trim();
    const descricao = String(item.job_description || '').trim();
    const postada = item.posted_date ? new Date(item.posted_date) : null;
    return {
        Source: FONTE,
        LinkedinId: `vaga-${id}`,
        Url: url,
        Author: empresa || null,
        Content: [titulo, empresa, local && `📍 Local: ${local}`, descricao].filter(Boolean).join('\n').slice(0, 3000),
        PostedAt: postada && !Number.isNaN(postada.getTime()) ? postada : null,
        Status: 'pending',
    };
}

export async function runVagasAnunciadas({ runId, creditoMinimo } = {}) {
    if (creditoMinimo && !temFolgaDeCredito(await apifyUsage().catch(() => null), creditoMinimo)) {
        return { found: 0, novos: 0, semFolga: true };
    }
    const s = { found: 0, novos: 0, duplicados: 0, porBusca: {}, runId };
    for (const b of BUSCAS) {
        try {
            const { items } = await runActor(ATOR_VAGAS, {
                jobs_titles: b.titulos, location: b.local, posted_within: 'Past 24 hours',
                include_job_details: b.descricao, jobs_entries: b.max,
            });
            const linhas = items.map(linhaDaVaga).filter(Boolean);
            const novas = linhas.length ? await sql`
                insert into "ScrapedPosts" ${sql(linhas, 'Source', 'LinkedinId', 'Url', 'Author', 'Content', 'PostedAt', 'Status')}
                on conflict ("LinkedinId") do nothing
                returning "Id"` : [];
            s.found += items.length;
            s.novos += novas.length;
            s.duplicados += linhas.length - novas.length;
            s.porBusca[b.nome] = { lidas: items.length, novas: novas.length };
        } catch (e) {
            // Uma busca que falha não leva as outras junto.
            s.porBusca[b.nome] = { erro: String(e.message).slice(0, 120) };
        }
    }
    return s;
}

/** Cria o robô uma vez. Quem o desligar no admin continua com ele desligado. */
export async function garantirRoboDasVagas() {
    const params = { vagasAnunciadas: true, creditoMinimo: 2 };
    await sql`
        insert into "ScraperSchedules" ("Name", "Type", "Params", "IntervalMinutes", "Active")
        select ${ROBO_DAS_VAGAS}, 'monitoring', ${sql.json(params)}, 1440, true
        where not exists (select 1 from "ScraperSchedules" where "Name" = ${ROBO_DAS_VAGAS})`;
}
