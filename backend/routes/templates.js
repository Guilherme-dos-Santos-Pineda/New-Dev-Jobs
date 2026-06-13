import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { VARIABLES, DEFAULT_LANG, defaultTemplate } from '../services/templates.js';

const router = Router();

// Busca o template do usuário; se não houver, devolve o padrão (sem salvar).
export async function resolveTemplate(userId, lang = DEFAULT_LANG) {
    const [saved] = await sql`select "Subject", "Body", "Lang" from "EmailTemplates" where "UserId" = ${userId} and "Lang" = ${lang}`;
    if (saved) return { subject: saved.Subject, body: saved.Body, lang, isDefault: false };
    const def = defaultTemplate(lang);
    return { subject: def.subject, body: def.body, lang, isDefault: true };
}

// GET /api/templates?lang=pt
router.get('/', requireAuth, async (req, res) => {
    const lang = (req.query.lang || DEFAULT_LANG).toString();
    const tpl = await resolveTemplate(req.user.Id, lang);
    res.json({ template: tpl, variables: VARIABLES, languages: ['pt'] });
});

// PUT /api/templates  { lang, subject, body }
router.put('/', requireAuth, async (req, res) => {
    const lang = (req.body?.lang || DEFAULT_LANG).toString();
    const subject = (req.body?.subject ?? '').toString();
    const body = (req.body?.body ?? '').toString();
    if (!subject.trim() || !body.trim()) {
        return res.status(400).json({ error: 'Assunto e corpo são obrigatórios' });
    }
    await sql`
        insert into "EmailTemplates" ("UserId", "Lang", "Subject", "Body", "UpdatedAt")
        values (${req.user.Id}, ${lang}, ${subject}, ${body}, now())
        on conflict ("UserId", "Lang") do update set
            "Subject" = excluded."Subject", "Body" = excluded."Body", "UpdatedAt" = now()`;
    res.json({ template: { subject, body, lang, isDefault: false } });
});

// POST /api/templates/reset  { lang }  → volta ao padrão
router.post('/reset', requireAuth, async (req, res) => {
    const lang = (req.body?.lang || DEFAULT_LANG).toString();
    await sql`delete from "EmailTemplates" where "UserId" = ${req.user.Id} and "Lang" = ${lang}`;
    res.json({ template: await resolveTemplate(req.user.Id, lang) });
});

export default router;
