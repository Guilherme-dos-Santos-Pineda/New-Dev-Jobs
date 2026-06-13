import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { planUsage } from '../services/usage.js';
import { getMatches } from '../services/jobsQuery.js';

const router = Router();

// GET /api/dashboard — métricas executivas + sparklines + próxima melhor vaga + atividades
router.get('/', requireAuth, async (req, res) => {
    const uid = req.user.Id;

    const [jobs] = await sql`
        select count(*)::int as total,
               count(*) filter (where "CreatedAt"::date = current_date)::int as today,
               count(distinct "Company") filter (where "Company" is not null and "Company" <> '')::int as companies
        from "Jobs"`;
    const [apps] = await sql`
        select count(*)::int as total,
               count(*) filter (where "CreatedAt" >= now() - interval '7 days')::int as week,
               coalesce(round(avg("MatchScore")), 0)::int as avgmatch
        from "Applications" where "UserId" = ${uid}`;
    const [rec] = await sql`select count(*)::int as total, count(*) filter (where "Status"='approved')::int as approved from "Recruiters"`;

    const usage = await planUsage(uid, req.user.Plan);

    // Vagas candidatáveis (reusa o matcher); a primeira é a "próxima melhor"
    const matches = await getMatches(uid);
    const compatible = matches.length;
    const matchesAbove90 = matches.filter((m) => m.matchScore >= 90).length;
    const nb = matches[0];
    const nextBest = nb ? { id: nb.id, title: nb.title, company: nb.company, matchScore: nb.matchScore, skills: (nb.matchedSkills || []).slice(0, 5) } : null;

    // Sparklines (últimos 7 dias)
    const sentSeriesRows = await sql`
        select count(a."Id")::int as c
        from generate_series(current_date - interval '6 days', current_date, interval '1 day') d
        left join "Applications" a on a."UserId" = ${uid} and a."CreatedAt"::date = d::date
        group by d order by d`;
    const jobSeriesRows = await sql`
        select count(j."Id")::int as c
        from generate_series(current_date - interval '6 days', current_date, interval '1 day') d
        left join "Jobs" j on j."CreatedAt"::date = d::date
        group by d order by d`;

    // Atividades recentes (timeline) + lista de candidaturas recentes
    const recentApps = await sql`
        select a."Id", a."Status", a."MatchScore", a."CreatedAt", j."JobTitle", j."Company"
        from "Applications" a join "Jobs" j on j."Id" = a."JobId"
        where a."UserId" = ${uid} order by a."CreatedAt" desc limit 5`;
    const recentJobs = await sql`select "JobTitle", "Company", "CreatedAt" from "Jobs" order by "CreatedAt" desc limit 4`;

    const activities = [
        ...recentApps.map((a) => ({
            type: a.Status === 'failed' ? 'danger' : 'ok',
            icon: a.Status === 'failed' ? 'ti-alert-triangle' : 'ti-send',
            text: a.Status === 'failed' ? `Falha ao enviar para ${a.Company || 'vaga'}` : `Currículo enviado · ${a.JobTitle || 'Vaga'}`,
            at: a.CreatedAt,
        })),
        ...recentJobs.map((j) => ({
            type: 'info', icon: 'ti-briefcase',
            text: `Nova vaga: ${j.JobTitle || 'Vaga'}${j.Company ? ` · ${j.Company}` : ''}`,
            at: j.CreatedAt,
        })),
    ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 7);

    res.json({
        metrics: {
            jobsToday: jobs.today, jobsTotal: jobs.total, companies: jobs.companies,
            sentTotal: apps.total, sentWeek: apps.week, avgMatch: apps.avgmatch,
            recruiters: rec.total, recruitersApproved: rec.approved,
            compatible, matchesAbove90,
            usedToday: usage.usedToday, remainingToday: usage.remainingToday, dailyLimit: usage.dailyLimit,
            timeSavedMin: apps.total * 6, // ~6 min poupados por candidatura automatizada
        },
        sparkSent: sentSeriesRows.map((r) => r.c),
        sparkJobs: jobSeriesRows.map((r) => r.c),
        nextBest,
        activities,
        recent: recentApps.map((r) => ({ id: r.Id, title: r.JobTitle, company: r.Company, matchScore: r.MatchScore, createdAt: r.CreatedAt })),
    });
});

export default router;
