import { Router } from 'express';
import { z } from 'zod';
import sql from '../lib/sql.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getBoss, SCRAPER_DISCOVERY, SCRAPER_MONITORING } from '../lib/boss.js';
import { reprocessPost, materializeJobFromPost } from '../services/scraper.js';
import { aiState } from '../services/ai.js';
import { apifyPoolState, resetApifyPool } from '../services/apifyPool.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { removeCv } from '../lib/cvStorage.js';

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
            (select count(*)::int from "Recruiters" where "Status"='approved') as recruitersApproved,
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
    const [s] = await sql`
        select count(*)::int as total,
               count(*) filter (where exists (select 1 from "Jobs" j where j."RecruiterId" = r."Id"))::int as withjobs,
               count(*) filter (where r."Email" is not null and r."Email" <> '')::int as withemail
        from "Recruiters" r`;
    res.json({ total: s.total, withJobs: s.withjobs, withoutJobs: s.total - s.withjobs, withEmail: s.withemail });
});

// GET /api/admin/recruiters?status=&hasJobs=&hasEmail=&q=&sort=&page=&pageSize=
router.get('/recruiters', requireAdmin, async (req, res) => {
    const status = req.query.status || null;
    const q = req.query.q ? `%${req.query.q}%` : null;
    const hasJobs = req.query.hasJobs || null;      // 'true' | 'false'
    const hasEmail = req.query.hasEmail || null;    // 'true'
    const monitorable = req.query.monitorable || null; // 'true' → só com perfil do LinkedIn
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize) || 25));
    const sortMap = {
        jobs: sql`jobs_count desc nulls last, r."UpdatedAt" desc`,
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
          and (${hasJobs}::text is null or (${hasJobs} = 'true') = exists (select 1 from "Jobs" j where j."RecruiterId" = r."Id"))`;

    const [{ total }] = await sql`select count(*)::int as total from "Recruiters" r ${where}`;
    const rows = await sql`
        select r.*,
            (select count(*)::int from "Jobs" j where j."RecruiterId" = r."Id") as jobs_count,
            (select count(*)::int from "Applications" a join "Jobs" j on j."Id" = a."JobId" where j."RecruiterId" = r."Id") as emails_sent
        from "Recruiters" r ${where}
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
    const where = sql`
        where (${q}::text is null or "JobTitle" ilike ${q} or "Company" ilike ${q})
          and (${seniority}::text is null or lower(coalesce("Seniority",'')) = lower(${seniority}))
          and (${minScore}::int is null or coalesce("AiScore",0) >= ${minScore})
          and (${techLike}::text is null or "Skills"::text ilike ${techLike})`;
    const [{ total }] = await sql`select count(*)::int as total from "Jobs" ${where}`;
    const rows = await sql`
        select * from "Jobs" ${where}
        order by "CreatedAt" desc, "Id" desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`;
    res.json({ jobs: rows.map(shapeJob), total, page, pageSize });
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
    res.json({ raw, jobs, dedup, ai: aiState(), apify: apifyPoolState(), runs: runs.map(shapeRun) });
});

// POST /api/admin/apify/reset — limpa as marcações de "sem crédito" das contas Apify.
router.post('/apify/reset', requireAdmin, (_req, res) => {
    res.json({ apify: resetApifyPool() });
});

export default router;
