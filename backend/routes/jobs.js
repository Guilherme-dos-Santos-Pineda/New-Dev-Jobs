import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { listForUser, getMatches, shapeJob } from '../services/jobsQuery.js';

const router = Router();

// GET /api/jobs?search=&minScore=&sort=&ignoreFilters=
router.get('/', requireAuth, async (req, res) => {
    const ignoreFilters = req.query.ignoreFilters === '1';
    let { jobs, filteredOut } = await listForUser(req.user.Id, { ignoreFilters });

    const search = (req.query.search || '').toString().toLowerCase();
    const minScore = Number(req.query.minScore) || 0;
    const sort = (req.query.sort || 'match').toString();

    if (search) {
        jobs = jobs.filter((j) =>
            [j.title, j.company, ...(j.skills || [])].filter(Boolean)
                .some((v) => v.toString().toLowerCase().includes(search)));
    }
    if (minScore > 0) jobs = jobs.filter((j) => j.matchScore >= minScore);
    if (sort === 'recent') jobs.sort((a, b) => b.id - a.id);
    else jobs.sort((a, b) => b.matchScore - a.matchScore);

    res.json({ jobs, total: jobs.length, filteredOut });
});

// GET /api/jobs/matches  — vagas candidatáveis (filtros + com email + não enviadas)
router.get('/matches', requireAuth, async (req, res) => {
    const matches = await getMatches(req.user.Id);
    res.json({ matches, total: matches.length });
});

// GET /api/jobs/:id
router.get('/:id', requireAuth, async (req, res) => {
    const [job] = await sql`select * from "Jobs" where "Id" = ${req.params.id}`;
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada' });
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${req.user.Id}`;
    const appliedRows = await sql`select "JobId" from "Applications" where "UserId" = ${req.user.Id}`;
    const appliedSet = new Set(appliedRows.map((r) => r.JobId));
    res.json({ job: shapeJob(job, profile, appliedSet) });
});

export default router;
