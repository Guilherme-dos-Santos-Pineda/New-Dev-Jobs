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
import sql from '../lib/sql.js';

const router = Router();

// Teto por lote. Vale o que sobrou da COTA DIÁRIA do plano, limitada a este
// valor — 7 é a cota do plano free, então na prática o free manda no máximo os 7
// de sempre. O teto fixo existe para o endpoint não virar porta de envio em massa
// se um dia a lista crescer ou um plano tiver cota alta.
const MAX_CANDIDATURAS = 7;

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

// GET /api/highlights[?post=1] — vagas remotas do dia.
//
// O post pronto NÃO vem por padrão nem para admin: ele só é pedido pela tela do
// admin (`?post=1`). Assim a resposta do dashboard nunca carrega ~900 caracteres
// de texto que aquela tela não usa, e o campo não fica circulando à toa.
router.get('/', requireAuth, async (req, res) => {
    const { post, ...publico } = await doDia();
    const querPost = req.query.post === '1' && ehAdmin(req.user);

    // Quais dessas o usuário já enviou: sem isso o botão "candidatar-se" some
    // depois do envio só quando a página é recarregada, e a pessoa clica de novo
    // achando que não funcionou.
    const ids = publico.vagas.map((v) => v.id);
    const enviadas = ids.length
        ? (await sql`select "JobId" from "Applications" where "UserId" = ${req.user.Id} and "JobId" = any(${ids}::bigint[])`)
            .map((r) => Number(r.JobId))
        : [];
    const jaEnviadas = new Set(enviadas);

    // Quanto ainda cabe hoje. A tela precisa disso ANTES de a pessoa escolher:
    // deixar marcar 7 para depois dizer "você já enviou 5 hoje" é fazer o usuário
    // descobrir a regra errando.
    const usage = await planUsage(req.user.Id, req.user.Plan);
    const podeEnviar = Math.max(0, Math.min(MAX_CANDIDATURAS, usage.remainingToday));

    res.json({
        ...publico,
        vagas: publico.vagas.map((v) => ({ ...v, applied: jaEnviadas.has(v.id) })),
        maxCandidaturas: podeEnviar,
        limiteDiario: usage.dailyLimit,
        usadoHoje: usage.usedToday,
        // O post pronto é ferramenta de DIVULGAÇÃO, não de uso do produto: quem
        // publica em nome da plataforma é quem responde por ela. Mandar o texto
        // para todo usuário seria distribuir material de marketing assinado pela
        // empresa sem nenhum controle sobre onde ele vai parar. A checagem é no
        // SERVIDOR: esconder só no frontend deixaria o texto na resposta da API
        // para qualquer um ler no DevTools.
        ...(querPost ? { post } : {}),
    });
});

const applySchema = z.object({
    jobIds: z.array(z.coerce.number().int().positive()).min(1).max(MAX_CANDIDATURAS),
});

// POST /api/highlights/apply { jobIds } — candidata-se a vagas da lista do dia
router.post('/apply', requireAuth, validate(applySchema), async (req, res) => {
    // Os destaques ficam ABERTOS ao plano free de propósito (decisão do dono):
    // são no máximo 7 por dia, a mesma cota grátis do envio automático, e saem do
    // mesmo contador. A seleção manual ampla — escolher entre as centenas de vagas
    // do feed, em /queue — continua sendo o recurso pago.
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
    res.status(201).json({
        queued: jobIds.length,
        ignoradas: pedidos.length - jobIds.length,
        // A tela avisa que isto consome a cota grátis do dia — e o numero tem de
        // vir do servidor, senão a UI e o contador real divergem.
        restanteHoje: Math.max(0, usage.remainingToday - jobIds.length),
        limiteDiario: usage.dailyLimit,
        status,
    });
});

export default router;
