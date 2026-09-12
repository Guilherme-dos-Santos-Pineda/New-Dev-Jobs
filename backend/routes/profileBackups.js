import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// =========================
// Perfis apagados (só admin)
// =========================
// A rede de proteção contra "apagaram minha conta e não fui eu". O usuário apaga
// o perfil; a linha inteira fica arquivada aqui e só o admin vê e restaura.
//
// Nada nestas rotas é acessível ao dono do perfil — nem para listar. Se a conta
// foi tomada, quem está com ela não pode conseguir apagar o backup também.

// GET /api/admin/profile-backups
router.get('/', requireAdmin, async (req, res) => {
    const limite = Math.min(Number(req.query.limit) || 50, 200);
    const rows = await sql`
        select b."Id", b."UserId", b."DeletedBy", b."Ip", b."UserAgent",
               b."RestoredAt", b."CreatedAt",
               u."Email", u."Name",
               -- O snapshot inteiro não vai na LISTAGEM: são dezenas de campos por
               -- linha e o admin só precisa reconhecer de quem é. O conteúdo sai
               -- no GET por id.
               (b."Snapshot" ->> 'Headline') as "Headline",
               jsonb_array_length(coalesce(b."Snapshot" -> 'Skills', '[]'::jsonb)) as "Skills",
               (b."Snapshot" ->> 'CvName') as "CvName",
               exists (select 1 from "Profiles" p where p."UserId" = b."UserId") as "TemPerfilAgora"
        from "ProfileBackups" b
        left join "Users" u on u."Id" = b."UserId"
        order by b."CreatedAt" desc
        limit ${limite}`;
    res.json({
        backups: rows.map((r) => ({
            id: Number(r.Id), userId: r.UserId, email: r.Email, name: r.Name,
            headline: r.Headline, skills: Number(r.Skills) || 0, cvName: r.CvName,
            deletedBy: r.DeletedBy, ip: r.Ip, userAgent: r.UserAgent,
            restoredAt: r.RestoredAt, createdAt: r.CreatedAt,
            temPerfilAgora: r.TemPerfilAgora,
        })),
    });
});

// GET /api/admin/profile-backups/:id — o retrato completo
router.get('/:id', requireAdmin, async (req, res) => {
    const [row] = await sql`select * from "ProfileBackups" where "Id" = ${Number(req.params.id)}`;
    if (!row) return res.status(404).json({ error: 'Backup não encontrado' });
    res.json({ backup: { id: Number(row.Id), userId: row.UserId, snapshot: row.Snapshot, createdAt: row.CreatedAt } });
});

// POST /api/admin/profile-backups/:id/restore
router.post('/:id/restore', requireAdmin, async (req, res) => {
    const [row] = await sql`select * from "ProfileBackups" where "Id" = ${Number(req.params.id)}`;
    if (!row) return res.status(404).json({ error: 'Backup não encontrado' });

    // Se a pessoa já refez o perfil, restaurar por cima apagaria o trabalho novo
    // dela para devolver o antigo — trocaria um estrago por outro.
    const [existente] = await sql`select 1 as ok from "Profiles" where "UserId" = ${row.UserId}`;
    if (existente) {
        return res.status(409).json({ error: 'Este usuário já tem um perfil ativo. Restaurar apagaria o atual — confira antes.' });
    }

    // "Id" e "UpdatedAt" saem: o primeiro é da linha antiga (o identity gera outro)
    // e o segundo tem de refletir a restauração, não a última edição de antes.
    const { Id, UpdatedAt, ...campos } = row.Snapshot;
    const colunas = Object.keys(campos);
    await sql`insert into "Profiles" ${sql(campos, ...colunas)}`;
    await sql`update "ProfileBackups" set "RestoredAt" = now() where "Id" = ${Number(req.params.id)}`;

    console.log(`♻️  perfil do usuário ${row.UserId} restaurado por ${req.user.Email}`);
    res.json({ ok: true, userId: row.UserId });
});

export default router;
