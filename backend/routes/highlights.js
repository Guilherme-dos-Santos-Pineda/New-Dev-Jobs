import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { config } from '../config.js';
import { destaquesDoDia } from '../services/highlights.js';
import { assertCanSend } from '../services/sender.js';
import { enqueue, getStatus } from '../services/sendQueue.js';
import { planUsage } from '../services/usage.js';
import { invalidateMatches } from '../services/jobsQuery.js';
import { planOf } from '../config/plans.js';
import sql from '../lib/sql.js';

const router = Router();

// Teto de vagas por candidatura em lote a partir dos destaques. A lista do dia
// tem 10; este limite existe para o endpoint não virar uma porta de envio em
// massa caso a lista cresça um dia.
const MAX_CANDIDATURAS = 10;

const ehAdmin = (u) => config.isAdminEmail(u?.Email) || u?.Role === 'admin';

// A lista é IGUAL para todo mundo e muda uma vez por dia, então não faz sentido
// recalcular por usuário: um cache de processo serve todos. Com 1000 usuários
// abrindo o dashboard, isto é uma consulta por dia em vez de mil.
let cache = null; // { dia, payload }

async function doDia() {
    const hoje = new Date().toISOString().slice(0, 10);
    if (cache?.dia !== hoje) cache = { dia: hoje, payload: await destaquesDoDia() };
    return cache.payload;
}

// GET /api/highlights — vagas remotas do dia (+ post pronto, só para admin)
router.get('/', requireAuth, async (req, res) => {
    const { post, ...publico } = await doDia();

    // Quais dessas o usuário já enviou: sem isso o botão "candidatar-se" some
    // depois do envio só quando a página é recarregada, e a pessoa clica de novo
    // achando que não funcionou.
    const ids = publico.vagas.map((v) => v.id);
    const enviadas = ids.length
        ? (await sql`select "JobId" from "Applications" where "UserId" = ${req.user.Id} and "JobId" = any(${ids}::bigint[])`)
            .map((r) => Number(r.JobId))
        : [];
    const jaEnviadas = new Set(enviadas);

    res.json({
        ...publico,
        vagas: publico.vagas.map((v) => ({ ...v, applied: jaEnviadas.has(v.id) })),
        maxCandidaturas: MAX_CANDIDATURAS,
        // O post pronto é ferramenta de DIVULGAÇÃO, não de uso do produto: quem
        // publica em nome da plataforma é quem responde por ela. Mandar o texto
        // para todo usuário seria distribuir material de marketing assinado pela
        // empresa sem nenhum controle sobre onde ele vai parar.
        ...(ehAdmin(req.user) ? { post } : {}),
    });
});

const applySchema = z.object({
    jobIds: z.array(z.coerce.number().int().positive()).min(1).max(MAX_CANDIDATURAS),
});

// POST /api/highlights/apply { jobIds } — candidata-se a vagas da lista do dia
router.post('/apply', requireAuth, validate(applySchema), async (req, res) => {
    // Escolher vaga a vaga É seleção manual, o recurso que separa o plano free do
    // pago. Liberar aqui daria de graça, por uma porta lateral, exatamente o que
    // o /queue cobra — e quem paga pelo Starter perceberia.
    if (!planOf(req.user.Plan).allowManual) {
        return res.status(402).json({ error: 'Candidatar-se a vagas escolhidas a dedo é um recurso dos planos pagos.', upgrade: true });
    }

    try { await assertCanSend(req.user.Id); }
    catch (e) { return res.status(e.status || 403).json({ error: e.message }); }

    // Só vale para as vagas da lista do dia. Sem esta checagem o endpoint
    // aceitaria qualquer "Id" e viraria um caminho paralelo para enviar a
    // qualquer vaga da base, sem passar pelos filtros do perfil.
    const { vagas } = await doDia();
    const doDiaIds = new Set(vagas.map((v) => v.id));
    const pedidos = [...new Set(req.body.jobIds.map(Number))].filter((id) => doDiaIds.has(id));
    if (!pedidos.length) return res.status(400).json({ error: 'Nenhuma vaga válida entre os destaques de hoje.' });

    // Já enviadas antes não voltam para a fila (o worker também pula, mas aqui a
    // pessoa recebe a resposta certa em vez de ver o contador subir à toa).
    const jaEnviadas = new Set(
        (await sql`select "JobId" from "Applications" where "UserId" = ${req.user.Id} and "JobId" = any(${pedidos}::bigint[])`)
            .map((r) => Number(r.JobId)),
    );
    const novas = pedidos.filter((id) => !jaEnviadas.has(id));
    if (!novas.length) return res.status(409).json({ error: 'Você já se candidatou a essas vagas.' });

    // Enfileirar SUBSTITUI o lote anterior (enqueue apaga a SendQueue do usuário).
    // Fazer isso a partir de um botão pequeno destruiria um envio em andamento
    // sem a pessoa entender o que aconteceu — melhor recusar e explicar.
    const atual = await getStatus(req.user.Id);
    if (atual.active) {
        return res.status(409).json({ error: `Você já tem ${atual.pending} envio(s) na fila. Espere terminar ou pare a fila antes de começar outro lote.` });
    }

    const usage = await planUsage(req.user.Id, req.user.Plan);
    if (usage.remainingToday <= 0) {
        return res.status(429).json({ error: `Você atingiu o limite diário do seu plano (${usage.dailyLimit}/dia). Tente amanhã ou faça upgrade.`, upgrade: true });
    }

    const jobIds = novas.slice(0, Math.min(usage.remainingToday, MAX_CANDIDATURAS));
    const status = await enqueue(req.user.Id, jobIds);
    invalidateMatches(req.user.Id); // o feed do usuário muda: estas vagas saem dele
    res.status(201).json({ queued: jobIds.length, ignoradas: pedidos.length - jobIds.length, status });
});

export default router;
