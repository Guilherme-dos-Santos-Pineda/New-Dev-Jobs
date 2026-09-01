import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { destaquesDoDia } from '../services/highlights.js';

const router = Router();

// A lista é IGUAL para todo mundo e muda uma vez por dia, então não faz sentido
// recalcular por usuário: um cache de processo serve todos. Com 1000 usuários
// abrindo o dashboard, isto é uma consulta por dia em vez de mil.
let cache = null; // { dia, payload }

// GET /api/highlights — vagas do dia + post pronto para o LinkedIn
router.get('/', requireAuth, async (_req, res) => {
    const hoje = new Date().toISOString().slice(0, 10);
    if (cache?.dia === hoje) return res.json(cache.payload);

    const payload = await destaquesDoDia();
    cache = { dia: hoje, payload };
    res.json(payload);
});

export default router;
