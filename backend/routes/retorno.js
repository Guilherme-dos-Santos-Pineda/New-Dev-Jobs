import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { perguntarAgora, responder, RESPOSTAS } from '../services/retornoEnvios.js';

const router = Router();

// O cartão é um extra: se a conferência falhar, ele só não aparece.
router.get('/', requireAuth, async (req, res) => {
    try {
        res.json({ perguntar: await perguntarAgora(req.user.Id) });
    } catch (e) {
        console.warn(`retorno: conferência falhou: ${e.message}`);
        res.json({ perguntar: false });
    }
});

router.post('/', requireAuth, async (req, res) => {
    const { resposta } = req.body || {};
    if (!RESPOSTAS.includes(resposta)) return res.status(400).json({ error: 'Resposta inválida.' });
    res.json({ gravou: await responder(req.user.Id, resposta) });
});

export default router;
