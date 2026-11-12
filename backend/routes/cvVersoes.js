import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { config } from '../config.js';
import { painelDeVersoes, gerarVersao, aprovarVersao, apagarVersao, VersaoError, podeUsarVersoes, ligarIaNosEnvios } from '../services/cvVersoes.js';

const router = Router();
const ehAdmin = (u) => config.isAdminEmail(u.Email) || u.Role === 'admin';
const acesso = async (req) => ({ acesso: await podeUsarVersoes(req.user, ehAdmin(req.user)), admin: ehAdmin(req.user) });
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

router.get('/', requireAuth, responder(async (req) => painelDeVersoes(req.user.Id, await acesso(req))));
// Liga/desliga a versão da IA nos envios (antes do /:id, que só aceita número).
router.put('/nos-envios', requireAuth, responder((req) => ligarIaNosEnvios(req.user, req.body?.ligado === true)));
router.post('/', requireAuth, responder(async (req) => gerarVersao(req.user.Id, { area: String(req.body?.area || ''), lang: req.body?.lang }, await acesso(req))));
router.post('/:id/aprovar', requireAuth, responder(async (req) => aprovarVersao(req.user.Id, idDe(req), await acesso(req))));
router.delete('/:id', requireAuth, responder(async (req) => apagarVersao(req.user.Id, idDe(req), await acesso(req))));

export default router;
