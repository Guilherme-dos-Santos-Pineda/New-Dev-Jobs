import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

function shape(f, uid) {
    return {
        id: f.Id,
        author: f.Author || 'Usuário',
        rating: f.Rating,
        message: f.Message,
        createdAt: f.CreatedAt,
        updatedAt: f.UpdatedAt,
        mine: f.UserId === uid,
    };
}

const clampRating = (r) => {
    const n = Number(r);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
};

async function withAuthor(id) {
    const [row] = await sql`select f.*, u."Name" as "Author" from "Feedback" f join "Users" u on u."Id"=f."UserId" where f."Id"=${id}`;
    return row;
}

async function buildSummary() {
    const [r] = await sql`
        select count(*)::int as total, avg("Rating") as avg,
            count(*) filter (where "Rating"=5)::int as s5,
            count(*) filter (where "Rating"=4)::int as s4,
            count(*) filter (where "Rating"=3)::int as s3,
            count(*) filter (where "Rating"=2)::int as s2,
            count(*) filter (where "Rating"=1)::int as s1
        from "Feedback" where "Rating" is not null`;
    return {
        rated: r.total || 0,
        average: r.total ? Math.round((r.avg || 0) * 10) / 10 : 0,
        distribution: { 5: r.s5, 4: r.s4, 3: r.s3, 2: r.s2, 1: r.s1 },
    };
}

// GET /api/feedback?limit=5
router.get('/', requireAuth, async (req, res) => {
    const rows = await sql`
        select f."Id", f."UserId", f."Rating", f."Message", f."CreatedAt", f."UpdatedAt", u."Name" as "Author"
        from "Feedback" f join "Users" u on u."Id" = f."UserId"
        order by f."CreatedAt" desc limit 100`;
    const all = rows.map((f) => shape(f, req.user.Id));
    const limit = Number(req.query.limit) || 0;
    res.json({
        feedback: limit > 0 ? all.slice(0, limit) : all,
        summary: { ...(await buildSummary()), count: all.length },
        mine: all.find((f) => f.mine) || null,
    });
});

// POST /api/feedback  { message, rating? } — um relato por usuário (cria ou atualiza)
router.post('/', requireAuth, async (req, res) => {
    const message = (req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Escreva seu relato' });
    if (message.length > 1000) return res.status(400).json({ error: 'Relato muito longo (máx. 1000)' });
    const rating = clampRating(req.body?.rating);

    const [mine] = await sql`select "Id" from "Feedback" where "UserId" = ${req.user.Id}`;
    let id;
    if (mine) {
        await sql`update "Feedback" set "Message"=${message}, "Rating"=${rating}, "UpdatedAt"=now() where "Id"=${mine.Id}`;
        id = mine.Id;
    } else {
        const [created] = await sql`insert into "Feedback" ("UserId","Rating","Message") values (${req.user.Id}, ${rating}, ${message}) returning "Id"`;
        id = created.Id;
    }
    res.status(mine ? 200 : 201).json({ feedback: shape(await withAuthor(id), req.user.Id) });
});

// PUT /api/feedback/:id  (apenas dono)
router.put('/:id', requireAuth, async (req, res) => {
    const [f] = await sql`select * from "Feedback" where "Id" = ${req.params.id}`;
    if (!f) return res.status(404).json({ error: 'Não encontrado' });
    if (f.UserId !== req.user.Id) return res.status(403).json({ error: 'Você só pode editar seu próprio relato' });
    const message = (req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Escreva seu relato' });
    await sql`update "Feedback" set "Message"=${message}, "Rating"=${clampRating(req.body?.rating)}, "UpdatedAt"=now() where "Id"=${f.Id}`;
    res.json({ feedback: shape(await withAuthor(f.Id), req.user.Id) });
});

// DELETE /api/feedback/:id  (apenas dono)
router.delete('/:id', requireAuth, async (req, res) => {
    const [f] = await sql`select "UserId" from "Feedback" where "Id" = ${req.params.id}`;
    if (!f) return res.status(404).json({ error: 'Não encontrado' });
    if (f.UserId !== req.user.Id) return res.status(403).json({ error: 'Você só pode apagar seu próprio relato' });
    await sql`delete from "Feedback" where "Id" = ${req.params.id}`;
    res.json({ ok: true });
});

export default router;
