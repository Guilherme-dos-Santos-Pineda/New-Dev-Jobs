import { Router } from 'express';
import { unsubscribeByToken } from '../services/campaigns.js';

// Rotas PÚBLICAS (sem auth). Ex.: descadastro de campanha via link no email.
const router = Router();

function page(title, msg) {
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;background:#0A0E14;color:#F0F6FC;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#161C26;border:1px solid #2A3240;border-radius:14px;padding:32px;max-width:420px;text-align:center}
h1{font-size:18px;margin:0 0 8px}p{color:#9DA7B3;font-size:14px;margin:0}</style></head>
<body><div class="card"><h1>${title}</h1><p>${msg}</p></div></body></html>`;
}

// GET /api/public/unsubscribe?token=...
router.get('/unsubscribe', async (req, res) => {
    const token = String(req.query.token || '');
    res.set('Content-Type', 'text/html; charset=utf-8');
    if (!/^[0-9a-f-]{36}$/i.test(token)) return res.status(400).send(page('Link inválido', 'O link de descadastro não é válido.'));
    try {
        const r = await unsubscribeByToken(token);
        if (!r.ok) return res.status(404).send(page('Não encontrado', 'Este link já não é válido.'));
        return res.send(page('Descadastro concluído ✅', `Pronto — <b>${r.email}</b> não receberá mais nossos emails.`));
    } catch {
        return res.status(500).send(page('Erro', 'Não foi possível processar. Tente novamente mais tarde.'));
    }
});

export default router;
