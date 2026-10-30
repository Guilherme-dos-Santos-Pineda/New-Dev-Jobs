import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { renderEmail } from '../services/templates.js';
import { resolveTemplate } from './templates.js';
import { applyToJob } from '../services/sender.js';
import { planUsage } from '../services/usage.js';
import { planOf } from '../config/plans.js';
import { getMatches, invalidateMatches } from '../services/jobsQuery.js';

const router = Router();

function shapeApp(a) {
    return {
        id: a.Id, jobId: a.JobId, company: a.Company, title: a.JobTitle,
        to: a.JobEmail, status: a.Status, matchScore: a.MatchScore,
        subject: a.Subject, body: a.Body, createdAt: a.CreatedAt, sentAt: a.SentAt,
        // Descricao da vaga a que a pessoa JA se candidatou: e o registro dela.
        // Nao e o mesmo caso do feed, onde o email de contato fica oculto porque a
        // vaga ainda nao foi enviada. Aqui o email ja aparece em "to" desde sempre.
        description: a.Description, lang: a.Lang,
    };
}

// GET /api/applications?page=&pageSize=
router.get('/', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(60, Math.max(6, Number(req.query.pageSize) || 24));
    const [{ total }] = await sql`select count(*)::int as total from "Applications" where "UserId" = ${req.user.Id}`;
    const rows = await sql`
        select a.*, j."Company", j."JobTitle", j."Email" as "JobEmail", j."Description"
        from "Applications" a join "Jobs" j on j."Id" = a."JobId"
        where a."UserId" = ${req.user.Id}
        order by a."CreatedAt" desc, a."Id" desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`;
    res.json({ applications: rows.map(shapeApp), total, page, pageSize });
});

// POST /api/applications/preview  { jobId, lang?, subject?, body? }
router.post('/preview', requireAuth, async (req, res) => {
    const jobId = Number(req.body?.jobId);
    const [job] = jobId ? await sql`select * from "Jobs" where "Id" = ${jobId}` : [null];
    const user = req.user;
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${req.user.Id}`;

    const sample = job || { JobTitle: 'Desenvolvedor(a) Backend', Company: 'Empresa Exemplo', Email: 'recrutador@empresa.com' };

    const tpl = await resolveTemplate(req.user.Id, (req.body?.lang || 'pt').toString());
    const subjectTemplate = req.body?.subject != null ? String(req.body.subject) : tpl.subject;
    const bodyTemplate = req.body?.body != null ? String(req.body.body) : tpl.body;

    const rendered = renderEmail({ subjectTemplate, bodyTemplate, user, profile, job: sample });
    res.json({
        preview: {
            ...rendered,
            from: user.GoogleEmail || user.Email,
            fromName: user.Name,
            to: sample.Email,
            company: sample.Company,
            title: sample.JobTitle,
            attachment: profile?.CvName || null,
        },
    });
});

// POST /api/applications  { jobId }
// Um envio por vez por usuário. O processo é um só em produção (worker
// embutido), então um cadeado em memória basta para a conferência de cota e o
// envio não correrem em paralelo: sem ele, 20 cliques simultâneos passariam
// todos pela conferência antes de qualquer envio contar.
const enviando = new Set();

router.post('/', requireAuth, async (req, res) => {
    const jobId = Number(req.body?.jobId);
    if (!jobId) return res.status(400).json({ error: 'jobId é obrigatório' });
    const uid = String(req.user.Id);
    if (enviando.has(uid)) return res.status(429).json({ error: 'Espere o envio anterior terminar.' });
    enviando.add(uid);
    try {
        const [existing] = await sql`select "Id" from "Applications" where "UserId" = ${req.user.Id} and "JobId" = ${jobId}`;
        if (existing) return res.status(409).json({ error: 'Você já se candidatou a esta vaga' });
        // applyToJob NÃO confere o teto diário (quem conferia era só o worker),
        // e esta rota aceitava qualquer vaga da base: dava para passar do limite
        // e mandar para vaga fora do feed. Agora vale a mesma regra do envio
        // automático e do "enviar você mesmo".
        // Escolher vaga a vaga é recurso pago quando os planos pagos estão
        // ligados; com eles desligados o grátis tem (config/planosPagos.js).
        if (!planOf(req.user.Plan).allowManual) return res.status(402).json({ error: 'Envio direto vaga a vaga é recurso dos planos pagos. Use "enviar pelo meu Gmail".' });
        const uso = await planUsage(req.user.Id, req.user.Plan);
        if (uso.remainingToday <= 0) return res.status(429).json({ error: `Você já usou os ${uso.dailyLimit} envios de hoje. Amanhã tem mais.` });
        const noFeed = (await getMatches(req.user.Id)).some((m) => String(m.id) === String(jobId));
        if (!noFeed) return res.status(403).json({ error: 'Esta vaga não está entre as suas.' });
        const r = await applyToJob(req.user.Id, jobId);
        if (r.skipped) return res.status(409).json({ error: 'Você já se candidatou a esta vaga' });
        const [created] = await sql`
            select a.*, j."Company", j."JobTitle", j."Email" as "JobEmail", j."Description"
            from "Applications" a join "Jobs" j on j."Id" = a."JobId" where a."Id" = ${r.applicationId}`;
        invalidateMatches(req.user.Id);
        res.status(201).json({ application: shapeApp(created) });
    } catch (e) {
        res.status(e.status || 502).json({ error: e.message });
    } finally {
        enviando.delete(uid);
    }
});

export default router;
