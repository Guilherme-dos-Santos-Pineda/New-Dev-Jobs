import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { painelDeVersoes, gerarVersao, aprovarVersao, apagarVersao, VersaoError, podeUsarVersoes, versoesNosEnvios } from '../services/cvVersoes.js';

const router = Router();
const ehAdmin = (u) => config.isAdminEmail(u.Email) || u.Role === 'admin';
const acesso = (req) => ({ acesso: podeUsarVersoes(req.user, ehAdmin(req.user)), nosEnvios: versoesNosEnvios(req.user) });
const responder = (fn) => async (req, res) => {
    try {
        res.json(await fn(req));
    } catch (e) {
        if (e instanceof VersaoError) return res.status(e.status).json({ error: e.message });
        console.error(`cv-versoes: ${e.message}`);
        res.status(500).json({ error: 'Não deu certo agora. Tente de novo.' });
    }
};
const idDe = (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new VersaoError('Versão inválida.', 400);
    return id;
};

router.get('/', requireAuth, responder((req) => painelDeVersoes(req.user.Id, acesso(req))));
router.post('/', requireAuth, responder((req) => gerarVersao(req.user.Id, { area: String(req.body?.area || ''), lang: req.body?.lang }, acesso(req))));
router.post('/:id/aprovar', requireAuth, responder((req) => aprovarVersao(req.user.Id, idDe(req), acesso(req))));
router.delete('/:id', requireAuth, responder((req) => apagarVersao(req.user.Id, idDe(req), acesso(req))));

export default router;
