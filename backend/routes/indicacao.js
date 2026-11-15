import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { painelIndicacao, registrarOrigem } from '../services/indicacao.js';

// "Indique e ganhe" e a origem da conta (services/indicacao.js).
const router = Router();

// GET /api/indicacao: o link da pessoa e quantas indicações já renderam.
router.get('/', requireAuth, async (req, res) => {
    try { res.json(await painelIndicacao(req.user.Id)); }
    catch (e) { console.error('indicação:', e.message); res.status(500).json({ error: 'Não deu para carregar sua indicação agora.' }); }
});

// POST /api/indicacao/origem { origem, ref }: o navegador manda, uma vez, o que
// guardou da primeira visita. Conta antiga ou já gravada não muda nada.
router.post('/origem', requireAuth, async (req, res) => {
    try { res.json(await registrarOrigem(req.user, req.body || {})); }
    catch (e) { console.warn('origem:', e.message); res.json({ origem: false, indicacao: false }); }
});

export default router;
