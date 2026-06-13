import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { getAuthUrl, consumeState, exchangeCodeAndStore, disconnect } from '../services/google.js';
import { planUsage } from '../services/usage.js';

const router = Router();

async function getUser(id) {
    const [u] = await sql`select * from "Users" where "Id" = ${id}`;
    return u;
}

export async function publicUser(user) {
    if (!user) return null;
    const [profile] = await sql`select "CvPath" from "Profiles" where "UserId" = ${user.Id}`;
    const usage = await planUsage(user.Id, user.Plan);
    return {
        id: user.Id,
        name: user.Name,
        email: user.Email,
        googleConnected: !!user.GoogleConnected,
        googleEmail: user.GoogleEmail || null,
        sendMode: user.SendMode || 'review',
        plan: usage.plan, // string (free|starter|pro) — mantido para compatibilidade
        planLabel: usage.label,
        planLimits: { dailyLimit: usage.dailyLimit, allowManual: usage.allowManual },
        usage: { usedToday: usage.usedToday, remainingToday: usage.remainingToday, dailyLimit: usage.dailyLimit },
        isAdmin: config.isAdminEmail(user.Email) || user.Role === 'admin',
        hasProfile: !!profile,
        hasCv: !!profile?.CvPath,
        createdAt: user.CreatedAt,
    };
}

// GET /api/auth/me  — identidade vem do JWT do Supabase (middleware attachUser)
router.get('/me', requireAuth, async (req, res) => {
    res.json({ user: await publicUser(req.user), googleConfigured: config.google.configured });
});

// PUT /api/auth/settings  { sendMode }
router.put('/settings', requireAuth, async (req, res) => {
    const mode = req.body?.sendMode === 'auto' ? 'auto' : 'review';
    await sql`update "Users" set "SendMode" = ${mode} where "Id" = ${req.user.Id}`;
    res.json({ user: await publicUser(await getUser(req.user.Id)) });
});

// ---------- Google OAuth (conectar Gmail para ENVIAR — escopo gmail.send) ----------

// GET /api/auth/google/url  → URL de consentimento (frontend redireciona)
router.get('/google/url', requireAuth, (req, res) => {
    if (!config.google.configured) {
        return res.status(503).json({ error: 'Google OAuth não configurado no servidor. Veja backend/SETUP_GOOGLE.md' });
    }
    res.json({ url: getAuthUrl(req.user.Id) });
});

// GET /api/auth/google/callback  ← Google redireciona aqui
router.get('/google/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const redirect = (status) => res.redirect(`${config.frontendUrl}/app/perfil?google=${status}`);

    if (error) return redirect('denied');
    const userId = consumeState(state);
    if (!code || !userId) return redirect('invalid');

    try {
        await exchangeCodeAndStore(code, userId);
        redirect('connected');
    } catch (e) {
        console.error('Erro no callback Google:', e.message);
        redirect('error');
    }
});

// POST /api/auth/disconnect-google
router.post('/disconnect-google', requireAuth, async (req, res) => {
    await disconnect(req.user.Id);
    res.json({ user: await publicUser(await getUser(req.user.Id)) });
});

router.post('/logout', (_req, res) => res.json({ ok: true }));

export default router;
