import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { assertCanSend } from '../services/sender.js';
import { getMatches } from '../services/jobsQuery.js';
import { enqueue, getStatus, stop } from '../services/sendQueue.js';
import { planOf } from '../config/plans.js';
import { planUsage } from '../services/usage.js';

const router = Router();

const queueSchema = z.object({
    mode: z.enum(['auto', 'manual']).optional(),
    jobIds: z.array(z.coerce.number().int().positive()).max(500).optional(),
});

// POST /api/queue  { mode: 'auto'|'manual', jobIds?: number[] }
router.post('/', requireAuth, validate(queueSchema), async (req, res) => {
    const mode = req.body?.mode === 'manual' ? 'manual' : 'auto';

    // Plano free: somente automático
    if (mode === 'manual' && !planOf(req.user.Plan).allowManual) {
        return res.status(402).json({ error: 'O modo de seleção manual está disponível nos planos pagos.', upgrade: true });
    }

    // Pré-requisitos de envio (Google, perfil, CV)
    try { await assertCanSend(req.user.Id); }
    catch (e) { return res.status(e.status || 403).json({ error: e.message }); }

    const matches = await getMatches(req.user.Id);
    const matchIds = new Set(matches.map((m) => m.id));

    let jobIds;
    if (mode === 'manual') {
        const requested = Array.isArray(req.body?.jobIds) ? req.body.jobIds.map(Number) : [];
        jobIds = requested.filter((id) => matchIds.has(id));
        if (!jobIds.length) return res.status(400).json({ error: 'Selecione ao menos uma vaga válida' });
    } else {
        jobIds = matches.map((m) => m.id);
        if (!jobIds.length) return res.status(400).json({ error: 'Nenhuma vaga disponível para envio' });
    }

    // Teto diário do plano: considera o que já foi enviado hoje
    const usage = await planUsage(req.user.Id, req.user.Plan);
    if (usage.remainingToday <= 0) {
        return res.status(429).json({ error: `Você atingiu o limite diário do seu plano (${usage.dailyLimit}/dia). Tente amanhã ou faça upgrade.`, upgrade: true });
    }
    jobIds = jobIds.slice(0, usage.remainingToday);

    const status = await enqueue(req.user.Id, jobIds);
    res.status(201).json({ mode, queued: jobIds.length, status });
});

// GET /api/queue
router.get('/', requireAuth, async (req, res) => res.json({ status: await getStatus(req.user.Id) }));

// POST /api/queue/stop
router.post('/stop', requireAuth, async (req, res) => res.json({ status: await stop(req.user.Id) }));

export default router;
