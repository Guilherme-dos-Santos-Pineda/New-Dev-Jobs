import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { getMatches, shapeJob, countCandidatable } from '../services/jobsQuery.js';
import { composeForJob, ComposeError } from '../services/compose.js';
import { semContato } from '../services/highlights.js';
import { invalidateMatches } from '../services/jobsQuery.js';
import { feedbackDisponivel, votar, meusLikes, MOTIVOS } from '../services/jobFeedback.js';

const router = Router();

// Quanto da descrição viaja na LISTAGEM. Cabe no card expandido sem obrigar uma
// segunda requisição na maioria dos casos, e corta o grosso do tráfego.
const PREVIEW_CHARS = 400;

// GET /api/jobs foi REMOVIDO.
//
// Devolvia `select * from "Jobs"` inteiro — 11 MB de resposta e a tabela toda na
// memória da VM — e nenhuma tela chamava: o app usa /jobs/matches, que já traz o
// feed filtrado e pontuado. Um endpoint autenticado capaz de derrubar o processo
// por RAM não fica de pé "por via das dúvidas"; se voltar a ser preciso listar
// vagas sem filtro, volta paginado.

// GET /api/jobs/matches  — vagas candidatáveis (filtros + com email + não enviadas)
router.get('/matches', requireAuth, async (req, res) => {
    const matches = await getMatches(req.user.Id);
    // Quantas vagas (com email, não enviadas) existem ignorando os filtros do perfil,
    // para explicar ao usuário quando os filtros estão escondendo vagas.
    //
    // É um NÚMERO, e antes ele custava um `select * from "Jobs"` inteiro — as
    // 6270 linhas com Description — só para contar no JavaScript. Medido em
    // produção: 2s por request, fora do memo do getMatches. Contar no banco dá
    // o mesmo resultado e usa o índice de "Applications".
    const candidatable = await countCandidatable(req.user.Id);
    // Segurança: NUNCA devolve o email de contato (evita coletar contatos sem usar a
    // plataforma). No plano free também oculta a descrição (o post traz o email no texto).
    //
    // A descrição vai TRUNCADA na listagem. A tela mostra uma descrição por vez
    // (ao expandir a vaga), então mandar o texto inteiro de todas era pagar ~2 MB
    // de tráfego para exibir alguns kB — e no celular isso é o carregamento
    // inteiro da tela. Quem expande busca o texto completo em GET /jobs/:id.
    //
    // O plano free recebia a descrição VAZIA, porque o post traz o email no
    // texto. Com os planos pagos desligados todo mundo é free, e ninguém
    // conseguiria ler a vaga antes de mandar o currículo. semContato() tira
    // email, telefone e link (é o que os destaques já usam), então a descrição
    // vai para todos, limpa.
    const safe = matches.map(({ email, description, ...m }) => (
        { ...m, description: description ? semContato(description).slice(0, PREVIEW_CHARS) : description }
    ));
    res.json({ matches: safe, total: matches.length, candidatable, filtered: Math.max(0, candidatable - matches.length) });
});

// GET /api/jobs/feedback/mine — os 👍 do usuário, e se o recurso está ligado
// (a tabela vem da migration 0017; sem ela a tela esconde os botões).
// Fica ANTES de /:id, senão "feedback" seria lido como id de vaga.
router.get('/feedback/mine', requireAuth, async (req, res) => {
    if (!(await feedbackDisponivel())) return res.json({ disponivel: false, likes: [], motivos: MOTIVOS });
    res.json({ disponivel: true, likes: await meusLikes(req.user.Id), motivos: MOTIVOS });
});

// POST /api/jobs/:id/feedback  { voto: 1 | -1 | 0, motivo? }
// O 👎 tira a vaga do feed desta pessoa (invalida o memo para sumir na hora).
router.post('/:id/feedback', requireAuth, async (req, res) => {
    if (!(await feedbackDisponivel())) return res.status(503).json({ error: 'Avaliação de vagas ainda não está disponível.' });
    const voto = Number(req.body?.voto);
    if (![1, -1, 0].includes(voto)) return res.status(400).json({ error: 'Voto inválido.' });
    const jobId = Number(req.params.id);
    if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: 'Vaga inválida.' });
    const [existe] = await sql`select 1 from "Jobs" where "Id" = ${jobId}`;
    if (!existe) return res.status(404).json({ error: 'Vaga não encontrada' });
    await votar(req.user.Id, jobId, voto, req.body?.motivo);
    invalidateMatches(req.user.Id);
    res.json({ ok: true, voto });
});

// POST /api/jobs/:id/compose  — email pronto para o usuário mandar do Gmail dele
//
// Esta é a ÚNICA rota que devolve o email de contato, e a exceção é estreita de
// propósito: uma vaga por vez, só se ela estiver no feed do próprio usuário, e
// gastando uma unidade do mesmo teto diário do envio automático. A regra de que
// /matches e /:id nunca devolvem contato continua valendo, e é o que impede que
// a base vire uma lista de emails para raspar.
//
// Não exige conta Google conectada: o objetivo é justamente provar valor antes
// de pedir a permissão do Gmail.
//
// A URL do Gmail é montada no NAVEGADOR, não aqui: assim o endereço do
// recrutador e o corpo do email não passam a viver em log de servidor nem em
// histórico de proxy só para abrir uma aba.
router.post('/:id/compose', requireAuth, async (req, res) => {
    try {
        const email = await composeForJob(req.user.Id, req.params.id, req.user.Plan);
        res.json(email);
    } catch (e) {
        if (e instanceof ComposeError) return res.status(e.status).json({ error: e.message });
        throw e;
    }
});

// GET /api/jobs/:id
router.get('/:id', requireAuth, async (req, res) => {
    const [job] = await sql`select * from "Jobs" where "Id" = ${req.params.id}`;
    if (!job) return res.status(404).json({ error: 'Vaga não encontrada' });
    const [profile] = await sql`select * from "Profiles" where "UserId" = ${req.user.Id}`;
    const appliedRows = await sql`select "JobId" from "Applications" where "UserId" = ${req.user.Id}`;
    const appliedSet = new Set(appliedRows.map((r) => r.JobId));
    // Segurança: NUNCA devolve o email de contato; no plano free também oculta a
    // descrição (o post traz o email no texto). Mesmo critério do /matches.
    // Descrição LIMPA (sem email, telefone e link) para todos. Mesmo critério
    // do /matches.
    const { email, description, ...rest } = shapeJob(job, profile, appliedSet);
    res.json({ job: { ...rest, description: description ? semContato(description) : description } });
});

export default router;
