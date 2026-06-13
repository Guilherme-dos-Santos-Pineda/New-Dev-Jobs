import { Router } from 'express';
import { z } from 'zod';
import sql from '../lib/sql.js';
import { requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getBoss, SCRAPER_DISCOVERY, SCRAPER_MONITORING } from '../lib/boss.js';

const router = Router();

function shapeSource(s) {
    return { id: s.Id, url: s.Url, label: s.Label, active: !!s.Active, createdAt: s.CreatedAt };
}

function shapeRecruiter(r) {
    return {
        id: r.Id, linkedinUrl: r.LinkedinUrl, name: r.Name, email: r.Email,
        title: r.Title, company: r.Company, status: r.Status,
        lastPostDate: r.LastPostDate, createdAt: r.CreatedAt,
    };
}

function shapeRun(r) {
    return {
        id: r.Id, type: r.Type, status: r.Status, params: r.Params, stats: r.Stats,
        error: r.Error, startedAt: r.StartedAt, finishedAt: r.FinishedAt, createdAt: r.CreatedAt,
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

// GET /api/admin/recruiters?status=
router.get('/recruiters', requireAdmin, async (req, res) => {
    const status = req.query.status;
    const rows = status
        ? await sql`select * from "Recruiters" where "Status" = ${status} order by "UpdatedAt" desc limit 500`
        : await sql`select * from "Recruiters" order by "UpdatedAt" desc limit 500`;
    res.json({ recruiters: rows.map(shapeRecruiter) });
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

// POST /api/admin/scraper/run  { type: 'discovery'|'monitoring', params? }
const runSchema = z.object({
    type: z.enum(['discovery', 'monitoring']),
    params: z.object({
        queries: z.array(z.string().min(1)).max(20).optional(),
        location: z.string().max(80).optional(),
        maxResults: z.coerce.number().int().min(1).max(50).optional(),
        maxPosts: z.coerce.number().int().min(1).max(50).optional(),
    }).optional(),
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

export default router;
