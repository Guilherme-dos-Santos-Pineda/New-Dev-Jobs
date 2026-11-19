import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { renderEmail } from '../services/templates.js';
import { resolveTemplate } from './templates.js';
import { applyToJob } from '../services/sender.js';
import { planUsage } from '../services/usage.js';
import { planOf, avisoDoLimite } from '../config/plans.js';
import { getMatches, invalidateMatches } from '../services/jobsQuery.js';
import { emailEditado } from '../services/emailEditado.js';
import { idiomaDaVaga } from '../services/classify.js';
import { linkDoPost, buscaDoPost } from '../services/linkDoPost.js';
import { avisarEmailVoltou } from '../services/emailVoltou.js';
import { config } from '../config.js';

const router = Router();

function shapeApp(a) {
    return {
        id: a.Id, jobId: a.JobId, company: a.Company, title: a.JobTitle,
        to: a.JobEmail, status: a.Status, matchScore: a.MatchScore,
        subject: a.Subject, body: a.Body, createdAt: a.CreatedAt, sentAt: a.SentAt,
        // Descricao da vaga a que a pessoa JA se candidatou: e o registro dela.
        // Nao e o mesmo caso do feed, onde o email de contato fica oculto porque a
        // vaga ainda nao foi enviada. Aqui o email ja aparece em "to" desde sempre.
        // Vaga do GitHub: o endereço da issue fica no post salvo (UrlDoPost).
        description: a.Description, lang: a.Lang, postUrl: linkDoPost(a.PostId) || (/^github:/.test(a.PostId || '') ? a.UrlDoPost : null) || null,
        buscaUrl: linkDoPost(a.PostId) ? null : buscaDoPost(a.JobTitle, a.Company),
        // Qual currículo foi: a versão da IA (plano com IA) ou, sem ela, o do perfil.
        cvVersao: a.CvVersaoNome || null,
        emailVoltou: !!a.EmailVoltou,
    };
}

// Filtro de Enviadas (19/11/2026): status e texto (vaga, empresa ou email).
// Só existem dois status aqui: 'sent' (pelo Gmail) e 'manual' ("enviar você mesmo").
// Falha e envio pulado ficam na fila (SendQueue), nunca viram candidatura: os chips
// "Falharam" e "Puladas" da primeira versão viviam vazios (relato do dono, 19/11/2026).
const FILTROS = {
    semana: sql`and a."SentAt" > now() - interval '7 days'`,
    gmail: sql`and a."Status" = 'sent'`,
    manual: sql`and a."Status" = 'manual'`,
    ia: sql`and a."CvVersaoId" is not null`,
    voltou: sql`and exists (select 1 from "EmailsVoltaram" v where v."ApplicationId" = a."Id")`,
};

// GET /api/applications?page=&pageSize=&q=&status=
router.get('/', requireAuth, async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(60, Math.max(6, Number(req.query.pageSize) || 24));
    const status = FILTROS[String(req.query.status || '')] || null;
    // ilike: maiúscula não importa (acento importa). Curinga digitado não vale.
    const q = String(req.query.q || '').trim().slice(0, 80).replace(/[%_\\]/g, '');
    const busca = sql`
        a."UserId" = ${req.user.Id}
        ${q ? sql`and (coalesce(j."JobTitle",'') || ' ' || coalesce(j."Company",'') || ' ' || coalesce(j."Email",'')) ilike ${'%' + q + '%'}` : sql``}`;
    const filtro = sql`${busca} ${status || sql``}`;
    // Contagem de cada chip numa consulta só (com a busca aplicada): chip vazio some da tela.
    const [c] = await sql`
        select count(*)::int as todas,
               count(*) filter (where a."SentAt" > now() - interval '7 days')::int as semana,
               count(*) filter (where a."Status" = 'sent')::int as gmail,
               count(*) filter (where a."Status" = 'manual')::int as manual,
               count(*) filter (where a."CvVersaoId" is not null)::int as ia,
               count(*) filter (where exists (select 1 from "EmailsVoltaram" v where v."ApplicationId" = a."Id"))::int as voltou
        from "Applications" a join "Jobs" j on j."Id" = a."JobId" where ${busca}`;
    const total = status ? c[String(req.query.status)] : c.todas;
    const rows = await sql`
        select a.*, j."Company", j."JobTitle", j."Email" as "JobEmail", j."Description", j."LinkedinId" as "PostId", p."Url" as "UrlDoPost",
               exists (select 1 from "EmailsVoltaram" v where v."ApplicationId" = a."Id") as "EmailVoltou"
        from "Applications" a join "Jobs" j on j."Id" = a."JobId"
        left join "ScrapedPosts" p on p."LinkedinId" = j."LinkedinId" and j."LinkedinId" like 'github:%'
        where ${filtro}
        order by a."CreatedAt" desc, a."Id" desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`;
    res.json({ applications: rows.map(shapeApp), total, page, pageSize, contagens: c });
});

// POST /api/applications/:id/email-voltou: o email desta candidatura voltou
// ("endereço não encontrado"). Regras contra abuso em services/emailVoltouLogic.js.
router.post('/:id/email-voltou', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Candidatura inválida.' });
    try {
        const admin = config.isAdminEmail(req.user.Email) || req.user.Role === 'admin';
        const r = await avisarEmailVoltou(req.user, id, { admin });
        if (r.erro) return res.status(400).json({ error: r.erro });
        res.json(r);
    } catch (e) {
        console.error('email voltou:', e.message);
        res.status(500).json({ error: 'Não deu para registrar agora.' });
    }
});

// POST /api/applications/preview  { jobId, lang?, subject?, body? }
router.post('/preview', requireAuth, async (req, res) => {
    const jobId = Number(req.body?.jobId);
    // Com uma vaga REAL a pré-visualização só vale para vaga do feed da pessoa,
    // e NUNCA devolve o endereço do recrutador. Antes aceitava qualquer jobId e
    // devolvia `to`: era um jeito de colher o email de qualquer vaga da base sem
    // gastar cota, furando a regra de que o contato só sai pelo compose.
    if (jobId) {
        const noFeed = (await getMatches(req.user.Id)).some((m) => String(m.id) === String(jobId));
        if (!noFeed) return res.status(403).json({ error: 'Esta vaga não está entre as suas.' });
    }
    const [job] = jobId ? await sql`select j.*, r."Name" as "AutorNome" from "Jobs" j left join "Recruiters" r on r."Id" = j."RecruiterId" where j."Id" = ${jobId}` : [null];
    const user = req.user;
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${req.user.Id}`;

    const sample = job || { JobTitle: 'Desenvolvedor(a) Backend', Company: 'Empresa Exemplo', Email: 'recrutador@empresa.com' };

    // Sem idioma no pedido (prévia de uma vaga), vale o mesmo do envio.
    const lang = req.body?.lang ? String(req.body.lang) : (job ? idiomaDaVaga(job) : 'pt');
    const tpl = await resolveTemplate(req.user.Id, lang);
    const subjectTemplate = req.body?.subject != null ? String(req.body.subject) : tpl.subject;
    const bodyTemplate = req.body?.body != null ? String(req.body.body) : tpl.body;

    const rendered = renderEmail({ subjectTemplate, bodyTemplate, user, profile, job: sample, lang });
    res.json({
        preview: {
            ...rendered,
            from: user.GoogleEmail || user.Email,
            fromName: user.Name,
            to: job ? null : sample.Email, // vaga real: o endereço não sai daqui
            company: sample.Company,
            title: sample.JobTitle,
            attachment: profile?.CvName || null,
        },
    });
});

// POST /api/applications  { jobId, subject?, body? }  (assunto e texto editados valem só para este envio)
// Um envio por vez por usuário. O processo é um só em produção (worker
// embutido), então um cadeado em memória basta para a conferência de cota e o
// envio não correrem em paralelo: sem ele, 20 cliques simultâneos passariam
// todos pela conferência antes de qualquer envio contar.
const enviando = new Set();

router.post('/', requireAuth, async (req, res) => {
    const jobId = Number(req.body?.jobId);
    if (!jobId) return res.status(400).json({ error: 'jobId é obrigatório' });
    const { editado, erro } = emailEditado(req.body);
    if (erro) return res.status(400).json({ error: erro });
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
        if (uso.remainingToday <= 0) return res.status(429).json({ error: avisoDoLimite(uso.dailyLimit) });
        const noFeed = (await getMatches(req.user.Id)).some((m) => String(m.id) === String(jobId));
        if (!noFeed) return res.status(403).json({ error: 'Esta vaga não está entre as suas.' });
        const r = await applyToJob(req.user.Id, jobId, editado);
        if (r.skipped) {
            const erros = { recrutador: 'Você já mandou currículo para este recrutador nos últimos 30 dias.', bloqueada: 'Esta vaga é de uma empresa que você bloqueou.' };
            return res.status(409).json({ error: erros[r.motivo] || 'Você já se candidatou a esta vaga' });
        }
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
