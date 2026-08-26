import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

// Canal PRIVADO de relato de bug. Separado de /feedback, que é um mural público
// de depoimentos — relato de bug descreve algo quebrado e às vezes carrega dado
// do próprio usuário, então não pode ir para uma vitrine.

const LIMITE_DIARIO = 10;      // por usuário — anti-spam sem atrapalhar quem reporta de verdade
const MAX_MENSAGEM = 2000;
const MAX_CONTEXTO = 500;      // cada campo capturado do navegador

/** Corta e normaliza um campo de contexto vindo do cliente (nunca confiar no tamanho). */
const contexto = (v) => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s.slice(0, MAX_CONTEXTO) : null;
};

// POST /api/bugs  { message, page?, userAgent?, viewport?, appError? }
router.post('/', requireAuth, async (req, res) => {
    const message = (req.body?.message || '').trim();
    if (message.length < 10) {
        return res.status(400).json({ error: 'Descreva o problema com um pouco mais de detalhe (mín. 10 caracteres).' });
    }
    if (message.length > MAX_MENSAGEM) {
        return res.status(400).json({ error: `Relato muito longo (máx. ${MAX_MENSAGEM} caracteres).` });
    }

    const [{ n }] = await sql`
        select count(*)::int as n from "BugReports"
        where "UserId" = ${req.user.Id} and "CreatedAt" >= now() - interval '24 hours'`;
    if (n >= LIMITE_DIARIO) {
        return res.status(429).json({ error: 'Você já enviou vários relatos hoje. Tente de novo amanhã ou fale com o suporte.' });
    }

    const [criado] = await sql`
        insert into "BugReports" ("UserId", "Message", "Page", "UserAgent", "Viewport", "AppError")
        values (${req.user.Id}, ${message}, ${contexto(req.body?.page)},
                ${contexto(req.body?.userAgent)}, ${contexto(req.body?.viewport)},
                ${contexto(req.body?.appError)})
        returning "Id", "CreatedAt"`;

    console.log(`🐞 bug #${criado.Id} de ${req.user.Email} em ${contexto(req.body?.page) || '?'}`);
    res.status(201).json({ id: Number(criado.Id), createdAt: criado.CreatedAt });
});

// GET /api/bugs/mine — o usuário acompanha o que relatou (e vê que foi resolvido)
router.get('/mine', requireAuth, async (req, res) => {
    const rows = await sql`
        select "Id", "Message", "Status", "CreatedAt" from "BugReports"
        where "UserId" = ${req.user.Id} order by "CreatedAt" desc limit 20`;
    res.json({
        reports: rows.map((r) => ({
            id: Number(r.Id), message: r.Message, status: r.Status, createdAt: r.CreatedAt,
        })),
    });
});

// ---------------- Admin ----------------

// GET /api/bugs?status=new
router.get('/', requireAdmin, async (req, res) => {
    const status = ['new', 'triaged', 'resolved', 'wontfix'].includes(req.query?.status)
        ? req.query.status : null;
    const rows = await sql`
        select b.*, u."Email", u."Name" from "BugReports" b
        join "Users" u on u."Id" = b."UserId"
        ${status ? sql`where b."Status" = ${status}` : sql``}
        order by b."CreatedAt" desc limit 200`;
    res.json({
        reports: rows.map((r) => ({
            id: Number(r.Id), message: r.Message, status: r.Status,
            page: r.Page, userAgent: r.UserAgent, viewport: r.Viewport, appError: r.AppError,
            adminNote: r.AdminNote, createdAt: r.CreatedAt,
            user: { email: r.Email, name: r.Name },
        })),
    });
});

// PUT /api/bugs/:id  { status?, adminNote? }
router.put('/:id', requireAdmin, async (req, res) => {
    const status = req.body?.status;
    if (status && !['new', 'triaged', 'resolved', 'wontfix'].includes(status)) {
        return res.status(400).json({ error: 'Status inválido' });
    }
    const nota = typeof req.body?.adminNote === 'string' ? req.body.adminNote.slice(0, MAX_MENSAGEM) : null;
    const [row] = await sql`
        update "BugReports"
        set "Status" = coalesce(${status ?? null}, "Status"),
            "AdminNote" = coalesce(${nota}, "AdminNote"),
            "UpdatedAt" = now()
        where "Id" = ${Number(req.params.id)}
        returning "Id", "Status"`;
    if (!row) return res.status(404).json({ error: 'Relato não encontrado' });
    res.json({ id: Number(row.Id), status: row.Status });
});

export default router;
