import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { chavePublica, inscrever, cancelar, estadoDe, avisar } from '../services/push.js';
import { prefsCompletas, prefsParaGravar } from '../services/pushLogic.js';

// Notificação no celular (services/push.js).
const router = Router();

// GET /api/push: a chave pública e o que a pessoa quer receber.
router.get('/', requireAuth, async (req, res) => {
    try { res.json({ chave: chavePublica(), ...(await estadoDe(req.user.Id)) }); }
    catch (e) { console.warn('push estado:', e.message); res.json({ chave: null, ligado: false, aparelhos: 0, prefs: prefsCompletas({}) }); }
});

// POST /api/push/inscrever { subscription }: este aparelho passa a receber.
router.post('/inscrever', requireAuth, async (req, res) => {
    try {
        await inscrever(req.user.Id, req.body?.subscription, req.get('user-agent'));
        res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message || 'Não deu para ativar agora.' }); }
});

// POST /api/push/cancelar { endpoint }: este aparelho para de receber.
router.post('/cancelar', requireAuth, async (req, res) => {
    await cancelar(req.user.Id, req.body?.endpoint);
    res.json({ ok: true });
});

// PUT /api/push/prefs { vagas, envio, plano, indicacao }: liga e desliga cada aviso.
router.put('/prefs', requireAuth, async (req, res) => {
    const [u] = await sql`select "NotifPrefs" from "Users" where "Id" = ${req.user.Id}`;
    const novas = { ...(u?.NotifPrefs || {}), ...prefsParaGravar(req.body) };
    await sql`update "Users" set "NotifPrefs" = ${sql.json(novas)} where "Id" = ${req.user.Id}`;
    res.json({ prefs: prefsCompletas(novas) });
});

// POST /api/push/teste: manda um aviso de teste para os aparelhos da pessoa.
router.post('/teste', requireAuth, async (req, res) => {
    const ok = await avisar(req.user.Id, 'teste', {
        title: 'Notificações ligadas',
        body: 'É assim que vão chegar os avisos de vagas novas.',
        url: '/app',
    }, { forcar: true });
    res.json({ ok });
});

export default router;
