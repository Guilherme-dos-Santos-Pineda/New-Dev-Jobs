import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { planUsage } from '../services/usage.js';

const router = Router();

// GET /api/stats
router.get('/', requireAuth, async (req, res) => {
    const uid = req.user.Id;
    const usage = await planUsage(uid, req.user.Plan);

    const [jobs] = await sql`
        select count(*)::int as total,
               count(*) filter (where "CreatedAt"::date = current_date)::int as today
        from "Jobs"`;
    const [apps] = await sql`
        select count(*)::int as total,
               count(*) filter (where "CreatedAt" >= now() - interval '7 days')::int as week,
               count(*) filter (where "CreatedAt"::date = current_date)::int as today,
               coalesce(round(avg("MatchScore")), 0)::int as avgmatch
        from "Applications" where "UserId" = ${uid}`;
    const [general] = await sql`
        select count(*)::int as total,
               count(*) filter (where "CreatedAt"::date = current_date)::int as today
        from "Applications"`;
    const recent = await sql`
        select a."Id", a."MatchScore", a."CreatedAt", j."Company", j."JobTitle"
        from "Applications" a join "Jobs" j on j."Id" = a."JobId"
        where a."UserId" = ${uid} order by a."CreatedAt" desc limit 5`;

    res.json({
        jobs: { today: jobs.today, total: jobs.total },
        applications: {
            week: apps.week,
            total: apps.total,
            today: apps.today,
            dailyLimit: usage.dailyLimit,
            remainingToday: usage.remainingToday,
            avgMatch: apps.avgmatch,
        },
        general: { today: general.today, total: general.total },
        recent: recent.map((r) => ({
            id: r.Id, company: r.Company, title: r.JobTitle, matchScore: r.MatchScore, createdAt: r.CreatedAt,
        })),
    });
});

export default router;
