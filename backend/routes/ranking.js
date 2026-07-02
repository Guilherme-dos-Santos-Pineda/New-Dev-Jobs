import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Minimização de PII: o ranking é visível a todos os logados, então expõe só
// "PrimeiroNome S." em vez do nome completo (o próprio usuário se acha pelo "me").
export function abbreviateName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'Usuário';
    const [first, ...rest] = parts;
    const last = rest.at(-1);
    return last ? `${first} ${last[0].toUpperCase()}.` : first;
}

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
        name: abbreviateName(r.Name),
        sent: r.sent,
        me: r.Id === req.user.Id,
    }));
    res.json({ ranking, metric: 'emails enviados hoje' });
});

export default router;
