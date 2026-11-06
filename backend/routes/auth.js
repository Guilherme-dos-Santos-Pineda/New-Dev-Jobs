import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth, purgeToken } from '../middleware/auth.js';
import { config } from '../config.js';
import { getAuthUrl, consumeState, exchangeCodeAndStore, disconnect } from '../services/google.js';
import { planUsage } from '../services/usage.js';
import { planOf } from '../config/plans.js';
import { compraLiberada } from '../config/planosPagos.js';
import { proximoEnvio } from '../services/autoEnvio.js';
import { assertCanSend } from '../services/sender.js';

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
        planExpiresAt: user.PlanExpiresAt ? new Date(user.PlanExpiresAt).getTime() : null,
        planLimits: { dailyLimit: usage.dailyLimit, allowManual: usage.allowManual, autoSend: usage.autoSend },
        autoEnvio: !!user.AutoEnvio,
        autoEnvioProximo: user.AutoEnvio ? proximoEnvio(user.AutoEnvioUltimo) : null,
        podeComprar: compraLiberada(user.Email),
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

// PUT /api/auth/auto-envio  { ativo }
// Conta a partir do próximo horário das 9h, nunca na hora. O dia é em UTC, e às 22h
// de Brasília já é "amanhã": gravar current_date pularia a manhã seguinte.
router.put('/auto-envio', requireAuth, async (req, res) => {
    const ativo = req.body?.ativo === true;
    if (ativo) {
        if (!planOf(req.user.Plan).autoSend) return res.status(402).json({ error: 'O envio automático faz parte do plano pago.', upgrade: true });
        try { await assertCanSend(req.user.Id); }
        catch (e) { return res.status(e.status || 403).json({ error: e.message }); }
        await sql`update "Users" set "AutoEnvio" = true, "AutoEnvioDesde" = now(), "AutoEnvioUltimo" = (now() - interval '12 hours')::date where "Id" = ${req.user.Id}`;
    } else {
        await sql`update "Users" set "AutoEnvio" = false where "Id" = ${req.user.Id}`;
    }
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

    // Estes dois caminhos NÃO logavam nada. Quando o primeiro usuário de fora
    // falhou ao conectar o Gmail, não havia uma linha sequer dizendo se ele
    // recusou no Google, se o state não bateu ou se o código não veio — o log
    // limpo parecia "não chegou aqui". Agora cada saída diz por quê.
    if (error) {
        console.warn(`Google callback: recusado no consentimento (${error})`);
        return redirect('denied');
    }
    const userId = consumeState(state);
    if (!code || !userId) {
        console.warn(`Google callback: ${!code ? 'sem code' : 'state invalido ou expirado'}`);
        return redirect('invalid');
    }

    try {
        const r = await exchangeCodeAndStore(code, userId);
        if (r.semPermissaoDeEnvio) {
            console.warn('Google callback: concluiu sem marcar a permissão de enviar');
            return redirect('sem-envio');
        }
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

// Logout: o Supabase invalida a sessão no signOut do frontend; aqui derrubamos o
// token do cache do middleware para o backend recusá-lo imediatamente (sem esperar o TTL).
router.post('/logout', (req, res) => {
    const header = req.headers.authorization || '';
    purgeToken(header.startsWith('Bearer ') ? header.slice(7) : null);
    res.json({ ok: true });
});

export default router;
