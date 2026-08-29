import { Router } from 'express';
import sql from '../lib/sql.js';
import { requireAuth } from '../middleware/auth.js';
import { getMatches, shapeJob, countCandidatable } from '../services/jobsQuery.js';

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
    const isFree = (req.user.Plan || 'free') === 'free';
    // A descrição vai TRUNCADA na listagem. A tela mostra uma descrição por vez
    // (ao expandir a vaga), então mandar o texto inteiro de todas era pagar ~2 MB
    // de tráfego para exibir alguns kB — e no celular isso é o carregamento
    // inteiro da tela. Quem expande busca o texto completo em GET /jobs/:id.
    const safe = matches.map(({ email, description, ...m }) => (
        isFree ? m : { ...m, description: description ? description.slice(0, PREVIEW_CHARS) : description }
    ));
    res.json({ matches: safe, total: matches.length, candidatable, filtered: Math.max(0, candidatable - matches.length) });
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
    const isFree = (req.user.Plan || 'free') === 'free';
    const { email, description, ...rest } = shapeJob(job, profile, appliedSet);
    const safe = isFree ? rest : { ...rest, description };
    res.json({ job: safe });
});

export default router;
