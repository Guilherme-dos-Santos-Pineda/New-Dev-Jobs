import sql from '../lib/sql.js';
import { computeMatch } from './matching.js';
import { renderEmail } from './templates.js';
import { sendApplicationEmail } from './mailer.js';
import { getCvBuffer } from '../lib/cvStorage.js';
import { resolveTemplate } from '../routes/templates.js';

class ApplyError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

/**
 * Verifica os pré-requisitos do usuário para enviar candidaturas.
 * Lança ApplyError se algo faltar. @returns { user, profile }
 */
export async function assertCanSend(userId) {
    const [user] = await sql`select * from "Users" where "Id" = ${userId}`;
    if (!user) throw new ApplyError('Usuário não encontrado', 404);
    if (!user.GoogleConnected) throw new ApplyError('Conecte sua conta Google antes de enviar', 403);
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${userId}`;
    if (!profile) throw new ApplyError('Complete seu perfil antes de enviar', 403);
    if (!profile.CvPath) throw new ApplyError('Faça upload do seu currículo antes de enviar', 403);
    return { user, profile };
}

/**
 * Candidata-se a uma vaga (renderiza template + envia email + registra).
 * @returns { applicationId, skipped }
 */
export async function applyToJob(userId, jobId) {
    const { user, profile } = await assertCanSend(userId);
    const [job] = await sql`select * from "Jobs" where "Id" = ${jobId}`;
    if (!job) throw new ApplyError('Vaga não encontrada', 404);
    if (!job.Email) throw new ApplyError('Vaga sem email de contato', 422);
    const [existing] = await sql`select "Id" from "Applications" where "UserId" = ${userId} and "JobId" = ${jobId}`;
    if (existing) return { skipped: true };

    const match = computeMatch(profile, job);
    const tpl = await resolveTemplate(userId, 'pt');
    const rendered = renderEmail({ subjectTemplate: tpl.subject, bodyTemplate: tpl.body, user, profile, job });

    const cvBuffer = await getCvBuffer(profile.CvPath);

    await sendApplicationEmail({
        userId, from: user.GoogleEmail || user.Email, to: job.Email,
        subject: rendered.subject, html: rendered.html, text: rendered.text,
        attachmentContent: cvBuffer, filename: profile.CvName,
    });

    const [created] = await sql`
        insert into "Applications" ("UserId", "JobId", "Status", "MatchScore", "Subject", "Body", "SentAt")
        values (${userId}, ${jobId}, 'sent', ${match.score}, ${rendered.subject}, ${rendered.text}, now())
        returning "Id"`;
    return { applicationId: created.Id, matchScore: match.score };
}

export { ApplyError };
