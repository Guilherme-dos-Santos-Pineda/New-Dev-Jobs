import { Router } from 'express';
import { z } from 'zod';
import sql from '../lib/sql.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getBoss, SCRAPER_DISCOVERY, SCRAPER_MONITORING } from '../lib/boss.js';
import { reprocessPost, materializeJobFromPost } from '../services/scraper.js';
import { aiState } from '../services/ai.js';
import { resetApifyPool, apifyUsage } from '../services/apifyPool.js';
import { createCampaign, listCampaigns, setCampaignStatus, deleteCampaign } from '../services/campaigns.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { removeCv } from '../lib/cvStorage.js';
import { decideConcessaoDePlano, DIAS_MAX_CONCESSAO } from '../services/billingLogic.js';
import { PLANS } from '../config/plans.js';
import { diagnosticoDoFeed } from '../services/diagnosticoFeed.js';
import { condicaoMonitoravel, DIAS_ENTRE_VISITAS } from '../services/recrutadorMonitoravel.js';
import { REMOVIDA_PELO_ADMIN, detectArea } from '../services/classify.js';

const router = Router();

function shapeSource(s) {
    return { id: s.Id, url: s.Url, label: s.Label, active: !!s.Active, createdAt: s.CreatedAt };
}

function shapeRecruiter(r) {
    return {
        id: r.Id, linkedinUrl: r.LinkedinUrl, name: r.Name, email: r.Email,
        title: r.Title, company: r.Company, status: r.Status, source: r.Source,
        lastPostDate: r.LastPostDate, lastCheckedAt: r.LastCheckedAt, checkCount: r.CheckCount,
        createdAt: r.CreatedAt,
        jobsCount: r.jobs_count ?? undefined, emailsSent: r.emails_sent ?? undefined,
        techBrCount: r.tech_br ?? undefined, monitoravel: r.monitoravel ?? undefined,
    };
}

function shapeRun(r) {
    return {
        id: r.Id, type: r.Type, status: r.Status, params: r.Params, stats: r.Stats,
        error: r.Error, startedAt: r.StartedAt, finishedAt: r.FinishedAt, createdAt: r.CreatedAt,
    };
}

function shapeSchedule(s) {
    return {
        id: s.Id, name: s.Name, type: s.Type, params: s.Params, intervalMinutes: s.IntervalMinutes,
        active: !!s.Active, lastRunAt: s.LastRunAt, nextRunAt: s.NextRunAt, createdAt: s.CreatedAt,
    };
}

// GET /api/admin/overview — números gerais da plataforma
router.get('/overview', requireAdmin, async (_req, res) => {
    const [stats] = await sql`
        select
            (select count(*)::int from "Users") as users,
            (select count(*)::int from "Jobs") as jobs,
            (select count(*)::int from "Applications") as applications,
            (select count(*)::int from "Feedback") as feedback,
            (select count(*)::int from "RecruiterSources") as sources,
            (select count(*)::int from "Recruiters") as recruiters,
            -- MONITORAVEIS, nao "aprovados": desde 04/10/2026 ter vaga na base
            -- ja basta. Contar so os aprovados mostraria um numero menor do que
            -- o robo realmente visita. Definicao unica em recrutadorMonitoravel.js.
            (select count(*)::int from "Recruiters" r where ${condicaoMonitoravel()}) as recruitersApproved,
            (select count(*)::int from "SendQueue" where "Status"='queued') as queued`;
    const topUsers = await sql`
        select u."Name", u."Email", u."Plan", count(a."Id")::int as apps
        from "Users" u left join "Applications" a on a."UserId" = u."Id"
        group by u."Id", u."Name", u."Email", u."Plan"
        order by apps desc, u."CreatedAt" desc limit 10`;
    res.json({
        stats,
        topUsers: topUsers.map((u) => ({ name: u.Name, email: u.Email, plan: u.Plan, apps: u.apps })),
    });
});

// ---------- Usuários (gestão) ----------
function shapeUser(u) {
    return {
        id: u.Id, name: u.Name, email: u.Email, plan: u.Plan, role: u.Role,
        googleConnected: !!u.GoogleConnected, googleEmail: u.GoogleEmail,
        createdAt: u.CreatedAt, apps: u.apps, hasCv: !!u.has_cv, areas: parseArr(u.areas),
    };
}

// GET /api/admin/users?q=&page=&pageSize=
router.get('/users', requireAdmin, async (req, res) => {
    const q = req.query.q ? `%${req.query.q}%` : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 25));
    const where = sql`where (${q}::text is null or u."Name" ilike ${q} or u."Email" ilike ${q})`;
    const [{ total }] = await sql`select count(*)::int as total from "Users" u ${where}`;
    const rows = await sql`
        select u."Id", u."Name", u."Email", u."Plan", u."Role", u."GoogleConnected", u."GoogleEmail", u."CreatedAt",
            (select count(*)::int from "Applications" a where a."UserId" = u."Id") as apps,
            exists(select 1 from "Profiles" p where p."UserId" = u."Id" and p."CvPath" is not null) as has_cv,
            (select p."Areas" from "Profiles" p where p."UserId" = u."Id") as areas
        from "Users" u ${where}
        order by u."CreatedAt" desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`;
    res.json({ users: rows.map(shapeUser), total, page, pageSize });
});

// GET /api/admin/users/:id — detalhe (perfil + candidaturas + último login)
router.get('/users/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    const [u] = await sql`select * from "Users" where "Id" = ${id}`;
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    const [p] = await sql`select * from "Profiles" where "UserId" = ${id}`;
    const apps = await sql`
        select a."Id", a."Status", a."MatchScore", a."CreatedAt", j."JobTitle", j."Company"
        from "Applications" a join "Jobs" j on j."Id" = a."JobId"
        where a."UserId" = ${id} order by a."CreatedAt" desc limit 25`;
    const [counts] = await sql`
        select count(*)::int as total,
               count(*) filter (where "Status"='sent')::int as sent,
               count(*) filter (where "Status"='failed')::int as failed
        from "Applications" where "UserId" = ${id}`;
    let auth = null;
    try {
        if (supabaseAdmin) {
            const { data } = await supabaseAdmin.auth.admin.getUserById(id);
            if (data?.user) auth = { lastSignIn: data.user.last_sign_in_at, createdAt: data.user.created_at, provider: data.user.app_metadata?.provider };
        }
    } catch { /* opcional */ }
    res.json({
        user: shapeUser({ ...u, apps: counts.total, has_cv: !!p?.CvPath, areas: p?.Areas }),
        profile: p ? {
            skills: parseArr(p.Skills), areas: parseArr(p.Areas), seniorities: parseArr(p.Levels),
            modalities: parseArr(p.Modalities), headline: p.Headline, region: p.Region,
            linkedin: p.Linkedin, github: p.Github, cvName: p.CvName, hasCv: !!p.CvPath,
        } : null,
        applications: apps.map((a) => ({ id: a.Id, status: a.Status, matchScore: a.MatchScore, createdAt: a.CreatedAt, title: a.JobTitle, company: a.Company })),
        counts, auth,
    });
});

// PATCH /api/admin/users/:id/plan — dá plano de cortesia, sem cobrança
//
// Existe porque não havia jeito nenhum de liberar plano para alguém a não ser
// mexendo no banco na mão.
//
// A linha que NÃO pode ser cruzada: isto escreve "Plan" e "PlanExpiresAt", e
// só. Nunca "Role". Admin é allowlist de email OU Role='admin', então dar o
// plano mais caro a alguém continua sem dar acesso nenhum ao painel. Se um dia
// alguém acrescentar "Role" a este update, a pessoa que recebeu cortesia passa
// a enxergar todos os usuários, todas as vagas e o post de divulgação.
const concessaoSchema = z.object({
    plan: z.string(),
    dias: z.coerce.number().int().min(1).max(DIAS_MAX_CONCESSAO).optional(),
});

// GET /api/admin/users/:id/feed — por que esta pessoa vê poucas vagas?
//
// Devolve a CASCATA de filtros, não só o total. O total sozinho já existia e
// não ajudou ninguém: foi a cascata que mostrou que 82% do corte de um usuário
// real vinha de um único filtro (data de postagem), e não do classificador.
//
// requireAdmin porque expõe os filtros e o feed de outra pessoa.
router.get('/users/:id/feed', requireAdmin, async (req, res) => {
    const [u] = await sql`select "Id", "Email", "Name" from "Users" where "Id" = ${req.params.id}`;
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    const diag = await diagnosticoDoFeed(req.params.id);
    res.json({ usuario: { id: u.Id, email: u.Email, nome: u.Name }, ...diag });
});

router.patch('/users/:id/plan', requireAdmin, validate(concessaoSchema), async (req, res) => {
    const id = req.params.id;
    const [alvo] = await sql`select "Id", "Email", "Plan", "PlanExpiresAt" from "Users" where "Id" = ${id}`;
    if (!alvo) return res.status(404).json({ error: 'Usuário não encontrado' });

    const decisao = decideConcessaoDePlano({
        plano: req.body.plan,
        dias: req.body.dias ?? 30,
        planosValidos: Object.keys(PLANS),
        atualMs: alvo.PlanExpiresAt ? new Date(alvo.PlanExpiresAt).getTime() : null,
    });
    if (!decisao.ok) return res.status(400).json({ error: decisao.erro });

    const expira = decisao.expiraEm ? new Date(decisao.expiraEm) : null;
    await sql`
        update "Users"
        set "Plan" = ${decisao.plano}, "PlanExpiresAt" = ${expira}
        where "Id" = ${id}`;

    // Fica no log porque é uma concessão sem rastro financeiro: sem isto, não
    // há como saber depois quem liberou o quê, nem quando.
    console.log(`🎁 plano concedido: ${alvo.Email} → ${decisao.plano}${expira ? ` até ${expira.toISOString().slice(0, 10)}` : ''} (por ${req.user.Email})`);

    res.json({ ok: true, plan: decisao.plano, planExpiresAt: expira });
});

// DELETE /api/admin/users/:id — apaga o usuário (auth + dados em cascata)
router.delete('/users/:id', requireAdmin, async (req, res) => {
    const id = req.params.id;
    if (id === req.user.Id) return res.status(400).json({ error: 'Você não pode apagar a própria conta por aqui.' });
    if (!supabaseAdmin) return res.status(503).json({ error: 'Supabase admin indisponível.' });
    try {
        const [p] = await sql`select "CvPath" from "Profiles" where "UserId" = ${id}`;
        if (p?.CvPath) await removeCv(p.CvPath); // limpa o CV do Storage (best-effort)
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (error) throw new Error(error.message);
        // O delete em auth.users cascateia para "Users" (FK on delete cascade) e dependentes.
        res.json({ ok: true });
    } catch (e) {
        console.error('Erro ao apagar usuário:', e.message);
        res.status(502).json({ error: 'Falha ao apagar usuário.' });
    }
});

// GET /api/admin/sources
router.get('/sources', requireAdmin, async (_req, res) => {
    const rows = await sql`select "Id", "Url", "Label", "Active", "CreatedAt" from "RecruiterSources" order by "Id" desc`;
    res.json({ sources: rows.map(shapeSource) });
});

// POST /api/admin/sources  { url, label }
router.post('/sources', requireAdmin, async (req, res) => {
    let url = (req.body?.url || '').trim();
    if (!/linkedin\.com/i.test(url)) return res.status(400).json({ error: 'Informe uma URL de perfil do LinkedIn' });
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/+/, '')}`;
    const label = (req.body?.label || '').trim().slice(0, 80) || null;
    await sql`insert into "RecruiterSources" ("Url", "Label", "Active") values (${url}, ${label}, true) on conflict ("Url") do nothing`;
    const [row] = await sql`select * from "RecruiterSources" where "Url" = ${url}`;
    res.status(201).json({ source: shapeSource(row) });
});

// PATCH /api/admin/sources/:id  { active }
router.patch('/sources/:id', requireAdmin, async (req, res) => {
    await sql`update "RecruiterSources" set "Active" = ${!!req.body?.active} where "Id" = ${Number(req.params.id)}`;
    res.json({ ok: true });
});

// DELETE /api/admin/sources/:id
router.delete('/sources/:id', requireAdmin, async (req, res) => {
    await sql`delete from "RecruiterSources" where "Id" = ${Number(req.params.id)}`;
    res.json({ ok: true });
});

// ---------- Base de recrutadores (scraper DevScout) ----------

// GET /api/admin/recruiters/stats — total / com vagas / sem vagas / com email
router.get('/recruiters/stats', requireAdmin, async (_req, res) => {
    // Agregado UMA vez e juntado: o `exists` por linha varria Jobs 5 mil vezes (7 s).
    const [s] = await sql`
        with jc as (select distinct "RecruiterId" as id from "Jobs" where "RecruiterId" is not null)
        select count(*)::int as total,
               count(jc.id)::int as withjobs,
               count(*) filter (where r."Email" is not null and r."Email" <> '')::int as withemail
        from "Recruiters" r left join jc on jc.id = r."Id"`;
    // Os números que a tela mostra no topo, na linguagem do robô: quem ele
    // visita, quantos já visitou nesta volta, quem foi bloqueado. Uma consulta
    // com subconsultas escalares (regra do pool: nada em paralelo).
    const [m] = await sql`
        select
            (select count(*)::int from "Recruiters" r where ${condicaoMonitoravel()}) as monitorados,
            (select count(*)::int from "Recruiters" r where ${condicaoMonitoravel()}
                and r."LastCheckedAt" > now() - make_interval(days => ${DIAS_ENTRE_VISITAS})) as visitados,
            (select count(*)::int from "Recruiters" where "Status" = 'rejected') as bloqueados,
            (select count(*)::int from "Recruiters" where "CreatedAt" > now() - interval '7 days') as novos7d`;
    res.json({
        total: s.total, withJobs: s.withjobs, withoutJobs: s.total - s.withjobs, withEmail: s.withemail,
        monitorados: m.monitorados, visitados: m.visitados, bloqueados: m.bloqueados, novos7d: m.novos7d,
        diasEntreVisitas: DIAS_ENTRE_VISITAS,
    });
});

// GET /api/admin/recruiters?status=&hasJobs=&hasEmail=&q=&sort=&page=&pageSize=
router.get('/recruiters', requireAdmin, async (req, res) => {
    const status = req.query.status || null;
    const q = req.query.q ? `%${req.query.q}%` : null;
    const hasJobs = req.query.hasJobs || null;      // 'true' | 'false'
    const hasEmail = req.query.hasEmail || null;    // 'true'
    const monitorable = req.query.monitorable || null; // 'true' → só com perfil do LinkedIn
    // Grupo na linguagem da tela: quem o robô visita, quem fica de fora, quem foi
    // bloqueado. A regra é a MESMA do robô (condicaoMonitoravel), senão a lista
    // contradiz o que ele faz.
    const grupos = {
        monitorados: sql`and ${condicaoMonitoravel()}`,
        fora: sql`and not (${condicaoMonitoravel()}) and coalesce(r."Status", '') <> 'rejected'`,
        bloqueados: sql`and r."Status" = 'rejected'`,
    };
    const grupo = grupos[req.query.grupo] || sql``;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 25));
    const sortMap = {
        jobs: sql`tech_br desc, jobs_count desc nulls last, r."UpdatedAt" desc`,
        emails: sql`emails_sent desc nulls last`,
        name: sql`r."Name" asc`,
        recent: sql`r."CreatedAt" desc`,
        stale: sql`r."LastCheckedAt" asc nulls first, r."Id" asc`, // mais obsoletos primeiro
    };
    const orderBy = sortMap[req.query.sort] || sortMap.jobs;

    const where = sql`
        where (${status}::text is null or r."Status" = ${status})
          and (${q}::text is null or r."Name" ilike ${q} or r."Email" ilike ${q} or r."Company" ilike ${q})
          and (${hasEmail}::text is null or (r."Email" is not null and r."Email" <> ''))
          and (${monitorable}::text is null or r."LinkedinUrl" is not null)
          and (${hasJobs}::text is null or (${hasJobs} = 'true') = (jc.id is not null))
          ${grupo}`;

    // As contagens por recrutador são agregadas UMA vez e juntadas. Antes eram
    // subconsultas por linha, e ordenar por "vagas" (o padrão da tela) obrigava a
    // calcular as 5 mil: 13 s para abrir a aba, com uma conexão do pool presa.
    const contagens = sql`
        with jc as (
            select "RecruiterId" as id, count(*)::int as n,
                   count(*) filter (where "IsBR" is not false and "Email" like '%@%.%'
                       and coalesce("Area", 'other') not in ('nontech', 'other'))::int as tech
            from "Jobs"
            where "RecruiterId" is not null group by 1
        ), ec as (
            select j."RecruiterId" as id, count(*)::int as n
            from "Applications" a join "Jobs" j on j."Id" = a."JobId"
            where j."RecruiterId" is not null group by 1
        )`;
    const de = sql`from "Recruiters" r left join jc on jc.id = r."Id" left join ec on ec.id = r."Id"`;

    const [{ total }] = await sql`${contagens} select count(*)::int as total ${de} ${where}`;
    const rows = await sql`
        ${contagens}
        select r.*, coalesce(jc.n, 0) as jobs_count, coalesce(ec.n, 0) as emails_sent,
               coalesce(jc.tech, 0) as tech_br, (${condicaoMonitoravel()}) as monitoravel
        ${de} ${where}
        order by ${orderBy}
        limit ${pageSize} offset ${(page - 1) * pageSize}`;
    res.json({ recruiters: rows.map(shapeRecruiter), total, page, pageSize });
});

// PATCH /api/admin/recruiters/:id  { status }
const recruiterPatchSchema = z.object({ status: z.enum(['discovered', 'approved', 'rejected']) });
router.patch('/recruiters/:id', requireAdmin, validate(recruiterPatchSchema), async (req, res) => {
    const [row] = await sql`update "Recruiters" set "Status" = ${req.body.status}, "UpdatedAt" = now() where "Id" = ${Number(req.params.id)} returning *`;
    if (!row) return res.status(404).json({ error: 'Recrutador não encontrado' });
    res.json({ recruiter: shapeRecruiter(row) });
});

// ---------- Execuções do scraper (bots) ----------

// GET /api/admin/scraper/runs
router.get('/scraper/runs', requireAdmin, async (_req, res) => {
    const rows = await sql`select * from "ScraperRuns" order by "CreatedAt" desc limit 30`;
    res.json({ runs: rows.map(shapeRun) });
});

// Schema dos parâmetros de um run (reusado pelo run manual e pelos agendamentos).
const scraperParams = z.object({
    queries: z.array(z.string().min(1)).max(20).optional(),
    // descoberta
    location: z.string().max(80).optional(),
    locations: z.array(z.string().min(1)).max(20).optional(),
    maxResults: z.coerce.number().int().min(1).max(100).optional(),
    takePages: z.coerce.number().int().min(1).max(40).optional(),
    // monitoramento
    maxPosts: z.coerce.number().int().min(1).max(100).optional(),
    source: z.enum(['global', 'saved', 'selected']).optional(),
    recruiterIds: z.array(z.coerce.number().int().positive()).max(50).optional(),
    maxRecruiters: z.coerce.number().int().min(1).max(500).optional(), // cap p/ rotação (saved)
    contentType: z.enum(['all', 'jobs']).optional(),
    postedLimit: z.enum(['any', '1h', '24h', 'week', 'month', '3months', '6months', 'year']).optional(),
    sortBy: z.enum(['relevance', 'date']).optional(),
    scrapePages: z.coerce.number().int().min(1).max(40).optional(),
    startPage: z.coerce.number().int().min(1).max(100).optional(),
    region: z.enum(['global', 'br']).optional(),
    excludeCountries: z.array(z.string().min(1)).max(20).optional(),
});

// POST /api/admin/scraper/run  { type: 'discovery'|'monitoring', params? }
const runSchema = z.object({
    type: z.enum(['discovery', 'monitoring']),
    params: scraperParams.optional(),
});
router.post('/scraper/run', requireAdmin, validate(runSchema), async (req, res) => {
    const { type, params = {} } = req.body;
    const boss = await getBoss();
    if (!boss) return res.status(503).json({ error: 'Fila indisponível (pg-boss).' });

    const [run] = await sql`
        insert into "ScraperRuns" ("Type", "Status", "Params") values (${type}, 'queued', ${sql.json(params)})
        returning *`;
    const queue = type === 'discovery' ? SCRAPER_DISCOVERY : SCRAPER_MONITORING;
    await boss.send(queue, { runId: Number(run.Id), params }, { retryLimit: 0, expireInSeconds: 600 });
    res.status(201).json({ run: shapeRun(run) });
});

// ---------- Robôs agendados (ScraperSchedules) — automação ----------

// GET /api/admin/robots — tudo o que a tela de robôs precisa numa chamada só:
// os robôs com o resultado da última execução, os números da semana, a
// cobertura dos recrutadores e o crédito da Apify. Consultas SEQUENCIAIS (regra
// do pool); o crédito vem do cache de 60 s de apifyUsage.
router.get('/robots', requireAdmin, async (_req, res) => {
    const schedules = await sql`select * from "ScraperSchedules" order by "Id" asc`;
    const recentes = await sql`select * from "ScraperRuns" order by "CreatedAt" desc limit 40`;
    const [n] = await sql`
        select
            (select count(*)::int from "Jobs" where "CreatedAt" > now() - interval '7 days' and "Email" like '%@%.%') as novas7d,
            (select count(*)::int from "Jobs" where "CreatedAt" > now() - interval '7 days' and "Email" like '%@%.%'
                and coalesce("Area", 'other') <> 'nontech' and "IsBR" is not false) as feed7d,
            (select coalesce(sum(("Stats"->>'found')::int), 0)::int from "ScraperRuns"
                where "CreatedAt" > now() - interval '7 days') as posts7d,
            (select count(*)::int from "ScraperRuns" where "CreatedAt" > now() - interval '7 days') as runs7d,
            (select count(*)::int from "ScraperRuns" where "CreatedAt" > now() - interval '7 days' and "Status" = 'failed') as falhas7d,
            (select count(*)::int from "Recruiters" r where ${condicaoMonitoravel()}) as monitorados,
            (select count(*)::int from "Recruiters" r where ${condicaoMonitoravel()}
                and r."LastCheckedAt" > now() - make_interval(days => ${DIAS_ENTRE_VISITAS})) as visitados`;
    const porDia = await sql`
        select to_char(d, 'YYYY-MM-DD') as dia,
               count(j."Id")::int as novas,
               count(j."Id") filter (where coalesce(j."Area", 'other') <> 'nontech' and j."IsBR" is not false)::int as feed
        from generate_series((now() at time zone 'America/Sao_Paulo')::date - 13,
                             (now() at time zone 'America/Sao_Paulo')::date, interval '1 day') d
        left join "Jobs" j on (j."CreatedAt" at time zone 'America/Sao_Paulo')::date = d::date
                          and j."Email" like '%@%.%'
        group by d order by d`;
    let apify = null;
    try { apify = await apifyUsage(); } catch { apify = null; }

    // Última execução de cada robô (o run guarda o scheduleId nos Params).
    const ultimaDe = (id) => recentes.find((r) => String(r.Params?.scheduleId) === String(id));
    res.json({
        robots: schedules.map((s) => ({ ...shapeSchedule(s), ultima: ultimaDe(s.Id) ? shapeRun(ultimaDe(s.Id)) : null })),
        runs: recentes.slice(0, 15).map(shapeRun),
        semana: n,
        diasEntreVisitas: DIAS_ENTRE_VISITAS,
        porDia,
        apify: apify ? { usado: apify.totalUsed, limite: apify.totalFree, restante: apify.totalRemaining } : null,
    });
});

// GET /api/admin/schedules
router.get('/schedules', requireAdmin, async (_req, res) => {
    const rows = await sql`select * from "ScraperSchedules" order by "Active" desc, "Id" desc`;
    res.json({ schedules: rows.map(shapeSchedule) });
});

// POST /api/admin/schedules  { name, type, intervalMinutes, params?, active? }
const scheduleSchema = z.object({
    name: z.string().min(1).max(80),
    type: z.enum(['discovery', 'monitoring']),
    intervalMinutes: z.coerce.number().int().min(15).max(10080), // 15 min … 7 dias
    active: z.boolean().optional(),
    params: scraperParams.optional(),
});
router.post('/schedules', requireAdmin, validate(scheduleSchema), async (req, res) => {
    const { name, type, intervalMinutes, params = {}, active = true } = req.body;
    const [row] = await sql`
        insert into "ScraperSchedules" ("Name", "Type", "Params", "IntervalMinutes", "Active", "NextRunAt")
        values (${name}, ${type}, ${sql.json(params)}, ${intervalMinutes}, ${active}, now())
        returning *`;
    res.status(201).json({ schedule: shapeSchedule(row) });
});

// PATCH /api/admin/schedules/:id  { active?, intervalMinutes?, name?, params?, runNow? }
const schedulePatch = z.object({
    active: z.boolean().optional(),
    intervalMinutes: z.coerce.number().int().min(15).max(10080).optional(),
    name: z.string().min(1).max(80).optional(),
    params: scraperParams.optional(),
    runNow: z.boolean().optional(), // agenda para o próximo tick (≤60s)
});
router.patch('/schedules/:id', requireAdmin, validate(schedulePatch), async (req, res) => {
    const id = Number(req.params.id);
    const { active, intervalMinutes, name, params, runNow } = req.body;
    const [row] = await sql`
        update "ScraperSchedules" set
            "Active"          = coalesce(${active ?? null}, "Active"),
            "IntervalMinutes" = coalesce(${intervalMinutes ?? null}, "IntervalMinutes"),
            "Name"            = coalesce(${name ?? null}, "Name"),
            "Params"          = coalesce(${params ? sql.json(params) : null}, "Params"),
            "NextRunAt"       = case when ${!!runNow} then now() else "NextRunAt" end,
            "UpdatedAt"       = now()
        where "Id" = ${id}
        returning *`;
    if (!row) return res.status(404).json({ error: 'Agendamento não encontrado' });
    res.json({ schedule: shapeSchedule(row) });
});

// DELETE /api/admin/schedules/:id
router.delete('/schedules/:id', requireAdmin, async (req, res) => {
    await sql`delete from "ScraperSchedules" where "Id" = ${Number(req.params.id)}`;
    res.json({ ok: true });
});

// POST /api/admin/schedules/bulk  { action, ids? } — em massa (ids ausente = TODOS)
const scheduleBulkSchema = z.object({
    action: z.enum(['activate', 'pause', 'delete']),
    ids: z.array(z.coerce.number().int().positive()).optional(),
});
router.post('/schedules/bulk', requireAdmin, validate(scheduleBulkSchema), async (req, res) => {
    const { action, ids } = req.body;
    const all = !ids || !ids.length;
    let rows;
    if (action === 'delete') {
        rows = all
            ? await sql`delete from "ScraperSchedules" returning "Id"`
            : await sql`delete from "ScraperSchedules" where "Id" = any(${ids}) returning "Id"`;
    } else {
        const active = action === 'activate';
        // ao ativar, agenda o disparo para já (NextRunAt = now); ao pausar, mantém.
        rows = all
            ? await sql`update "ScraperSchedules" set "Active" = ${active}, "NextRunAt" = case when ${active} then now() else "NextRunAt" end, "UpdatedAt" = now() returning "Id"`
            : await sql`update "ScraperSchedules" set "Active" = ${active}, "NextRunAt" = case when ${active} then now() else "NextRunAt" end, "UpdatedAt" = now() where "Id" = any(${ids}) returning "Id"`;
    }
    res.json({ ok: true, action, affected: rows.length });
});

// ---------- Vagas (com filtros) ----------
const parseArr = (v) => (Array.isArray(v) ? v : []);
function shapeJob(j) {
    return {
        id: j.Id, company: j.Company, title: j.JobTitle, email: j.Email, skills: parseArr(j.Skills),
        aiScore: j.AiScore, classification: j.AiClassification, seniority: j.Seniority,
        modality: j.Modality, location: j.Location, salary: j.Salary, description: j.Description,
        linkedinId: j.LinkedinId, postedAt: j.PostedAt, createdAt: j.CreatedAt,
        area: j.Area, level: j.Level, isBR: j.IsBR, recruiterName: j.recruiter_name ?? undefined,
        recruiterUrl: j.recruiter_url ?? undefined,
        removida: j.AiClassification === REMOVIDA_PELO_ADMIN,
    };
}

// GET /api/admin/jobs?q=&seniority=&minScore=&tech=
router.get('/jobs', requireAdmin, async (req, res) => {
    const q = req.query.q ? `%${req.query.q}%` : null;
    const seniority = req.query.seniority || null;
    const minScore = req.query.minScore ? Number(req.query.minScore) : null;
    const techLike = req.query.tech ? `%${req.query.tech}%` : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(10, Number(req.query.pageSize) || 30));
    // Grupos na linguagem da tela. "no feed" é o que um usuário BR pode receber:
    // com email, fora de outras profissões e não marcada como de fora do Brasil
    // (os mesmos cortes de buscarCandidatas antes do perfil).
    const NO_FEED = sql`j."Email" like '%@%.%' and coalesce(j."Area", 'other') <> 'nontech' and j."IsBR" is not false`;
    const grupos = {
        feed: sql`and ${NO_FEED}`,
        fora_ti: sql`and j."Area" = 'nontech'`,
        fora_br: sql`and j."IsBR" is false and coalesce(j."Area", 'other') <> 'nontech'`,
        sem_area: sql`and coalesce(j."Area", 'other') = 'other'`,
        sem_email: sql`and (j."Email" is null or j."Email" not like '%@%.%')`,
        removidas: sql`and j."AiClassification" = ${REMOVIDA_PELO_ADMIN}`,
    };
    const grupo = grupos[req.query.grupo] || sql``;
    const area = req.query.area || null;
    const dias = { hoje: 1, '7d': 7, '30d': 30 }[req.query.periodo] || null;
    const where = sql`
        where (${q}::text is null or j."JobTitle" ilike ${q} or j."Company" ilike ${q})
          and (${seniority}::text is null or lower(coalesce(j."Seniority",'')) = lower(${seniority}))
          and (${minScore}::int is null or coalesce(j."AiScore",0) >= ${minScore})
          and (${techLike}::text is null or j."Skills"::text ilike ${techLike})
          and (${area}::text is null or j."Area" = ${area})
          and (${dias}::int is null or j."CreatedAt" > now() - make_interval(days => ${dias}))
          ${grupo}`;
    const [{ total }] = await sql`select count(*)::int as total from "Jobs" j ${where}`;
    const rows = await sql`
        select j.*, r."Name" as recruiter_name, r."LinkedinUrl" as recruiter_url
        from "Jobs" j left join "Recruiters" r on r."Id" = j."RecruiterId"
        ${where}
        order by j."CreatedAt" desc, j."Id" desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`;
    // Contagem por grupo no mesmo recorte de busca/período, para os chips da tela
    // dizerem quanto tem em cada um sem a pessoa precisar clicar para descobrir.
    const base = sql`
        where (${q}::text is null or j."JobTitle" ilike ${q} or j."Company" ilike ${q})
          and (${dias}::int is null or j."CreatedAt" > now() - make_interval(days => ${dias}))`;
    const [c] = await sql`
        select count(*)::int as todas,
               count(*) filter (where ${NO_FEED})::int as feed,
               count(*) filter (where j."Area" = 'nontech')::int as fora_ti,
               count(*) filter (where j."IsBR" is false and coalesce(j."Area", 'other') <> 'nontech')::int as fora_br,
               count(*) filter (where coalesce(j."Area", 'other') = 'other')::int as sem_area,
               count(*) filter (where j."Email" is null or j."Email" not like '%@%.%')::int as sem_email,
               count(*) filter (where j."AiClassification" = ${REMOVIDA_PELO_ADMIN})::int as removidas
        from "Jobs" j ${base}`;
    res.json({ jobs: rows.map(shapeJob), total, page, pageSize, contagens: c });
});

// POST /api/admin/jobs/:id/remover — "isto não é vaga de TI": sai do feed de
// todo mundo e não volta. A marca vai em AiClassification (classifyJob respeita
// em toda reclassificação) e o post de origem fica 'rejected', que o scraper já
// pula: sem isso, o mesmo post coletado de novo voltaria como vaga nova.
// Não apaga: a vaga pode ter candidaturas ligadas, e remover é reversível.
router.post('/jobs/:id/remover', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const [j] = await sql`
        update "Jobs" set "AiClassification" = ${REMOVIDA_PELO_ADMIN}, "Area" = 'nontech'
        where "Id" = ${id} returning *`;
    if (!j) return res.status(404).json({ error: 'Vaga não encontrada' });
    if (j.LinkedinId) await sql`update "ScrapedPosts" set "Status" = 'rejected' where "LinkedinId" = ${j.LinkedinId}`;
    res.json({ job: shapeJob(j) });
});

// POST /api/admin/jobs/:id/restaurar — desfaz o "remover": volta a valer a regra.
router.post('/jobs/:id/restaurar', requireAdmin, async (req, res) => {
    const id = Number(req.params.id);
    const [atual] = await sql`select * from "Jobs" where "Id" = ${id}`;
    if (!atual) return res.status(404).json({ error: 'Vaga não encontrada' });
    const area = detectArea(atual);
    const [j] = await sql`
        update "Jobs" set "AiClassification" = null, "Area" = ${area}
        where "Id" = ${id} returning *`;
    if (j.LinkedinId) await sql`update "ScrapedPosts" set "Status" = 'pending' where "LinkedinId" = ${j.LinkedinId} and "Status" = 'rejected'`;
    res.json({ job: shapeJob(j) });
});

// ---------- Conteúdo bruto (ScrapedPosts) ----------
function shapeRaw(p) {
    return {
        id: p.Id, source: p.Source, author: p.Author, authorUrl: p.AuthorUrl, url: p.Url,
        content: p.Content, postedAt: p.PostedAt, status: p.Status, ai: p.AiResult, createdAt: p.CreatedAt,
    };
}

// GET /api/admin/raw?status=&page=&pageSize=
router.get('/raw', requireAdmin, async (req, res) => {
    const status = req.query.status || null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize) || 20));
    const where = status ? sql`where "Status" = ${status}` : sql``;
    const [{ total }] = await sql`select count(*)::int as total from "ScrapedPosts" ${where}`;
    const rows = await sql`select * from "ScrapedPosts" ${where} order by "CreatedAt" desc limit ${pageSize} offset ${(page - 1) * pageSize}`;
    res.json({ posts: rows.map(shapeRaw), total, page, pageSize });
});

// POST /api/admin/raw/bulk  { action: approve|reject|reprocess, status? } — em lote
const rawBulkSchema = z.object({
    action: z.enum(['approve', 'reject', 'reprocess']),
    status: z.enum(['pending', 'approved', 'rejected']).optional(),
});
router.post('/raw/bulk', requireAdmin, validate(rawBulkSchema), async (req, res) => {
    const { action } = req.body;
    const status = req.body.status || 'pending';
    const rows = await sql`select "Id", "LinkedinId" from "ScrapedPosts" where "Status" = ${status} order by "CreatedAt" desc limit 500`;
    let done = 0;
    for (const p of rows) {
        try {
            if (action === 'approve') {
                await sql`update "ScrapedPosts" set "Status" = 'approved' where "Id" = ${p.Id}`;
                await materializeJobFromPost(p.Id);
            } else if (action === 'reject') {
                await sql`update "ScrapedPosts" set "Status" = 'rejected' where "Id" = ${p.Id}`;
                if (p.LinkedinId) await sql`delete from "Jobs" where "LinkedinId" = ${p.LinkedinId}`;
            } else if (action === 'reprocess') {
                await reprocessPost(p.Id);
            }
            done += 1;
        } catch { /* segue */ }
    }
    res.json({ ok: true, action, done, total: rows.length });
});

// PATCH /api/admin/raw/:id  { status }
const rawPatchSchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });
router.patch('/raw/:id', requireAdmin, validate(rawPatchSchema), async (req, res) => {
    const id = Number(req.params.id);
    const [row] = await sql`update "ScrapedPosts" set "Status" = ${req.body.status} where "Id" = ${id} returning *`;
    if (!row) return res.status(404).json({ error: 'Post não encontrado' });
    let job = null;
    if (req.body.status === 'approved') {
        // força a criação da vaga mesmo que a IA tenha descartado
        try { job = await materializeJobFromPost(id); } catch (e) { job = { ok: false, reason: e.message }; }
    } else if (req.body.status === 'rejected' && row.LinkedinId) {
        // bloqueia: remove a vaga gerada por este post (futuras execuções não recriam)
        await sql`delete from "Jobs" where "LinkedinId" = ${row.LinkedinId}`;
    }
    res.json({ post: shapeRaw(row), job });
});

// POST /api/admin/raw/:id/reprocess — re-roda a IA no post
router.post('/raw/:id/reprocess', requireAdmin, async (req, res) => {
    try {
        const ai = await reprocessPost(Number(req.params.id));
        res.json({ ai });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// GET /api/admin/ai-stats — estatísticas de IA/scraper + observabilidade
router.get('/ai-stats', requireAdmin, async (_req, res) => {
    const [raw] = await sql`
        select count(*)::int as total,
               count(*) filter (where "Status"='approved')::int as approved,
               count(*) filter (where "Status"='rejected')::int as rejected,
               count(*) filter (where "Status"='pending')::int as pending,
               count(*) filter (where ("AiResult"->>'isJob')::boolean)::int as classified_jobs
        from "ScrapedPosts"`;
    const [jobs] = await sql`select count(*)::int as total, coalesce(round(avg("AiScore")),0)::int as avgscore, count(*) filter (where "AiScore" is not null)::int as withai from "Jobs"`;
    // Agregado de dedup a partir dos runs de monitoramento
    const [dedup] = await sql`
        select coalesce(sum(("Stats"->>'found')::int), 0)::int as found,
               coalesce(sum(("Stats"->>'novos')::int), 0)::int as novos,
               coalesce(sum(("Stats"->>'duplicados')::int), 0)::int as duplicados,
               coalesce(sum(("Stats"->>'descartadosIA')::int), 0)::int as descartados
        from "ScraperRuns" where "Type" = 'monitoring'`;
    dedup.taxaDuplicacao = (dedup.novos + dedup.duplicados) ? Math.round((dedup.duplicados / (dedup.novos + dedup.duplicados)) * 100) : 0;
    const runs = await sql`select * from "ScraperRuns" order by "CreatedAt" desc limit 10`;
    // apify: uso REAL do mês (via API da Apify) — o estado em memória do pool não
    // serve aqui porque o scraper roda no worker (outro processo), não na API.
    let apify = null;
    try { apify = await apifyUsage(); } catch { apify = null; }
    res.json({ raw, jobs, dedup, ai: aiState(), apify, runs: runs.map(shapeRun) });
});

// POST /api/admin/apify/reset — limpa as marcações de "sem crédito" das contas Apify.
router.post('/apify/reset', requireAdmin, (_req, res) => {
    res.json({ apify: resetApifyPool() });
});

// ---------- Campanhas (email marketing) ----------
router.get('/campaigns', requireAdmin, async (_req, res) => {
    res.json({ campaigns: await listCampaigns() });
});
const campaignSchema = z.object({
    name: z.string().min(1).max(120),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(20000),
    // aceita email puro ("x@y.com") OU o formato do Resend ("Nome <x@y.com>")
    fromEmail: z.string().min(3).max(200).refine(
        (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()) || /<[^\s@]+@[^\s@]+\.[^\s@]+>\s*$/.test(v.trim()),
        'Remetente inválido (use "email@dominio" ou "Nome <email@dominio>").',
    ),
    // Reply-To: para onde vão as RESPOSTAS (um email real que você lê). Opcional.
    replyTo: z.string().max(200).refine(
        (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim()),
        'Reply-To inválido (use um email, ex.: voce@gmail.com).',
    ).optional(),
    dailyCap: z.coerce.number().int().min(1).max(500).optional(),
    gapMin: z.coerce.number().int().min(30).max(600).optional(),
    gapMax: z.coerce.number().int().min(30).max(600).optional(),
    emails: z.array(z.string()).min(1).max(20000),
});
router.post('/campaigns', requireAdmin, validate(campaignSchema), async (req, res) => {
    try { res.status(201).json(await createCampaign(req.body)); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/campaigns/:id/status', requireAdmin, async (req, res) => {
    try { await setCampaignStatus(req.params.id, req.body?.status); res.json({ ok: true }); }
    catch (e) { res.status(400).json({ error: e.message }); }
});
router.delete('/campaigns/:id', requireAdmin, async (req, res) => {
    await deleteCampaign(req.params.id);
    res.json({ ok: true });
});

// GET /api/admin/report — relatório de custo/vagas: gasto real Apify × vagas coletadas.
router.get('/report', requireAdmin, async (_req, res) => {
    const [jobs] = await sql`
        select count(*)::int as total,
               count(*) filter (where "CreatedAt"::date = current_date)::int as today,
               count(*) filter (where "CreatedAt" >= now() - interval '7 days')::int as week,
               count(*) filter (where "CreatedAt" >= date_trunc('month', now()))::int as month,
               count(*) filter (where "Email" is not null and "Email" <> '')::int as with_email
        from "Jobs"`;
    // Runs de monitoramento no mês corrente (agrega os Stats)
    const [runs] = await sql`
        select count(*)::int as runs,
               count(*) filter (where "Status"='failed')::int as failed,
               coalesce(sum(("Stats"->>'found')::int),0)::int as found,
               coalesce(sum(("Stats"->>'novos')::int),0)::int as novos,
               coalesce(sum(("Stats"->>'duplicados')::int),0)::int as duplicados,
               coalesce(sum(("Stats"->>'descartadosIA')::int),0)::int as descartados,
               coalesce(sum(("Stats"->>'semEmail')::int),0)::int as sem_email
        from "ScraperRuns" where "Type"='monitoring' and "CreatedAt" >= date_trunc('month', now())`;
    // Timeline: vagas coletadas por dia (últimos 14 dias)
    const series = await sql`
        select to_char(d,'DD/MM') as day, count(j."Id")::int as c
        from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
        left join "Jobs" j on j."CreatedAt"::date = d::date
        group by d order by d`;

    let apify = null;
    try { apify = await apifyUsage(); } catch (e) { apify = { error: e.message }; }

    // Custo/vaga usa a contagem REAL de vagas do mês (tabela Jobs), não runs.novos
    // (as Stats dos runs subestimam — runs sem crédito/falhos não gravam stats).
    const jobsMonth = jobs.month || 0;
    const used = apify?.totalUsed || 0;
    const costPerJob = jobsMonth > 0 && used > 0 ? used / jobsMonth : null;
    const projectedLeft = costPerJob ? Math.floor((apify?.totalRemaining || 0) / costPerJob) : null;
    const useRate = runs.found > 0 ? Math.round((runs.novos / runs.found) * 100) : 0; // funil (parcial)

    res.json({
        jobs, runs, apify,
        timeline: series.map((s) => ({ day: s.day, c: s.c })),
        efficiency: {
            jobsMonth, costPerJob, projectedLeft, useRate,
            novosRecorded: runs.novos, // registrado nos runs (parcial)
            jobsPerDollar: costPerJob ? Math.round(1 / costPerJob) : null,
        },
    });
});

export default router;
