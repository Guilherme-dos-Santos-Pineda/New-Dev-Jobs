import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoDaAnalise, analisarCurriculo, analiseDaPessoa, AnaliseError } from '../services/analiseCv.js';

const router = Router();
const ehAdmin = (u) => config.isAdminEmail(u.Email) || u.Role === 'admin';

router.get('/', requireAuth, async (req, res) => {
    try {
        res.json(await estadoDaAnalise(req.user.Id, { admin: ehAdmin(req.user) }));
    } catch (e) {
        console.warn(`analise-cv: estado falhou: ${e.message}`);
        res.json({ disponivel: false });
    }
});

router.get('/:id', requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Análise inválida.' });
    const a = await analiseDaPessoa(req.user.Id, id).catch(() => null);
    if (!a) return res.status(404).json({ error: 'Análise não encontrada.' });
    res.json(a);
});

router.post('/', requireAuth, async (req, res) => {
    try {
        res.json(await analisarCurriculo(req.user.Id, { admin: ehAdmin(req.user) }));
    } catch (e) {
        if (e instanceof AnaliseError) return res.status(e.status).json({ error: e.message });
        console.error(`analise-cv: erro: ${e.message}`);
        res.status(500).json({ error: 'A análise não saiu agora. Tente de novo: esta tentativa não foi contada.' });
    }
});

export default router;
