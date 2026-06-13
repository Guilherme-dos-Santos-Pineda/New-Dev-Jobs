import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { renderEmail } from '../services/templates.js';
import { resolveTemplate } from './templates.js';
import { sendApplicationEmail } from '../services/mailer.js';
import { getCvBuffer } from '../lib/cvStorage.js';

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/email/test  { to }
// Envia um email de teste (usando o template + currículo do usuário) para validar o envio real.
router.post('/test', requireAuth, async (req, res) => {
    const user = req.user;
    const to = (req.body?.to || '').trim();
    if (!EMAIL_RE.test(to)) return res.status(400).json({ error: 'Email de destino inválido' });
    if (!user.GoogleConnected) return res.status(403).json({ error: 'Conecte sua conta Google antes de enviar o teste' });

    const [profile] = await sql`select * from "Profiles" where "UserId" = ${req.user.Id}`;
    const sampleJob = { JobTitle: 'Desenvolvedor(a) — vaga de teste', Company: 'newdevjobs', Email: to };
    const tpl = await resolveTemplate(req.user.Id, 'pt');
    const rendered = renderEmail({
        subjectTemplate: `[TESTE] ${tpl.subject}`,
        bodyTemplate: tpl.body,
        user, profile, job: sampleJob,
    });

    try {
        const cvBuffer = profile?.CvPath ? await getCvBuffer(profile.CvPath) : null;
        const result = await sendApplicationEmail({
            userId: user.Id,
            from: user.GoogleEmail || user.Email,
            to,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            attachmentContent: cvBuffer,
            filename: profile?.CvName || null,
        });
        res.json({ ok: true, to, provider: result.provider, messageId: result.messageId });
    } catch (e) {
        console.error('Falha no email de teste:', e.message);
        res.status(502).json({ error: `Falha ao enviar: ${e.message}` });
    }
});

export default router;
