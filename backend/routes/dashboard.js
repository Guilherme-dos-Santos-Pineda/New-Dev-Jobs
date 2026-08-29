import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { planUsage } from '../services/usage.js';
import { getMatches } from '../services/jobsQuery.js';

const router = Router();

// =========================
// GET /api/dashboard
// =========================
// As métricas vêm em UMA consulta, não em nove paralelas — e isso é o que
// impede o processo de se enforcar sozinho.
//
// Antes: `Promise.all` com 7 consultas + planUsage + getMatches = até 10 conexões
// do pool (max 25) POR REQUISIÇÃO. Três dashboards simultâneos já pedem 30
// conexões: cada requisição fica segurando as que conseguiu enquanto espera as
// que faltam, e nenhuma libera nada. Isso não é lentidão, é impasse — medido em
// produção, o pool travou com as 25 conexões abertas e não voltou sozinho; até
// um `select 1` passou a dar timeout, com o Postgres ocioso (12 de 60 conexões)
// e o Node respondendo 32 requisições sem banco a 61 ms. O gargalo era a
// aritmética do fan-out, não capacidade de nada.
//
// Com subconsultas escalares o custo no banco é o mesmo (são os mesmos índices),
// mas a requisição usa 3 conexões em vez de 10 — e 8 dashboards simultâneos
// passam a caber no pool com folga.
router.get('/', requireAuth, async (req, res) => {
    const uid = req.user.Id;

    const [[m], usage, matches] = await Promise.all([
        sql`
            select
                (select count(*)::int from "Jobs")                                        as jobs_total,
                (select count(*)::int from "Jobs" where "CreatedAt"::date = current_date) as jobs_today,
                (select count(distinct "Company")::int from "Jobs"
                  where "Company" is not null and "Company" <> '')                        as jobs_companies,
                (select count(*)::int from "Applications" where "UserId" = ${uid})        as apps_total,
                (select count(*)::int from "Applications"
                  where "UserId" = ${uid} and "CreatedAt" >= now() - interval '7 days')    as apps_week,
                (select coalesce(round(avg("MatchScore")), 0)::int from "Applications"
                  where "UserId" = ${uid})                                                as apps_avgmatch,
                (select count(*)::int from "Recruiters")                                  as rec_total,
                (select count(*)::int from "Recruiters" where "Status" = 'approved')      as rec_approved,
                (select coalesce(json_agg(c order by d), '[]'::json) from (
                    select d, count(a."Id")::int as c
                    from generate_series(current_date - interval '6 days', current_date, interval '1 day') d
                    left join "Applications" a on a."UserId" = ${uid} and a."CreatedAt"::date = d::date
                    group by d
                 ) s)                                                                     as spark_sent,
                (select coalesce(json_agg(c order by d), '[]'::json) from (
                    select d, count(j."Id")::int as c
                    from generate_series(current_date - interval '6 days', current_date, interval '1 day') d
                    left join "Jobs" j on j."CreatedAt"::date = d::date
                    group by d
                 ) s)                                                                     as spark_jobs,
                (select coalesce(json_agg(x), '[]'::json) from (
                    select a."Id", a."Status", a."MatchScore", a."CreatedAt", j."JobTitle", j."Company"
                    from "Applications" a join "Jobs" j on j."Id" = a."JobId"
                    where a."UserId" = ${uid} order by a."CreatedAt" desc limit 5
                 ) x)                                                                     as recent_apps,
                (select coalesce(json_agg(x), '[]'::json) from (
                    select "JobTitle", "Company", "CreatedAt" from "Jobs"
                    order by "CreatedAt" desc limit 4
                 ) x)                                                                     as recent_jobs`,
        planUsage(uid, req.user.Plan),
        getMatches(uid),
    ]);

    const recentApps = m.recent_apps || [];
    const recentJobs = m.recent_jobs || [];

    const compatible = matches.length;
    const matchesAbove90 = matches.filter((x) => x.matchScore >= 90).length;
    const nb = matches[0];
    const nextBest = nb ? { id: nb.id, title: nb.title, company: nb.company, matchScore: nb.matchScore, skills: (nb.matchedSkills || []).slice(0, 5) } : null;

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
            jobsToday: m.jobs_today, jobsTotal: m.jobs_total, companies: m.jobs_companies,
            sentTotal: m.apps_total, sentWeek: m.apps_week, avgMatch: m.apps_avgmatch,
            recruiters: m.rec_total, recruitersApproved: m.rec_approved,
            compatible, matchesAbove90,
            usedToday: usage.usedToday, remainingToday: usage.remainingToday, dailyLimit: usage.dailyLimit,
            timeSavedMin: m.apps_total * 6, // ~6 min poupados por candidatura automatizada
        },
        sparkSent: m.spark_sent || [],
        sparkJobs: m.spark_jobs || [],
        nextBest,
        activities,
        recent: recentApps.map((r) => ({ id: r.Id, title: r.JobTitle, company: r.Company, matchScore: r.MatchScore, createdAt: r.CreatedAt })),
    });
});

export default router;
