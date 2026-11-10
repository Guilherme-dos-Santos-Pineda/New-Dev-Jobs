import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { estadoDaAnalise, analisarCurriculo, AnaliseError } from '../services/analiseCv.js';

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
