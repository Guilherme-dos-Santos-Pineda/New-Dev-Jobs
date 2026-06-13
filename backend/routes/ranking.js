import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// GET /api/ranking — Top 10 usuários por e-mails enviados HOJE
router.get('/', requireAuth, async (req, res) => {
    const rows = await sql`
        select u."Id", u."Name", count(a."Id")::int as sent
        from "Applications" a join "Users" u on u."Id" = a."UserId"
        where a."CreatedAt"::date = current_date
        group by u."Id", u."Name"
        order by sent desc, u."Name" asc
        limit 10`;
    const ranking = rows.map((r, i) => ({
        position: i + 1,
        name: r.Name || 'Usuário',
        sent: r.sent,
        me: r.Id === req.user.Id,
    }));
    res.json({ ranking, metric: 'emails enviados hoje' });
});

export default router;
