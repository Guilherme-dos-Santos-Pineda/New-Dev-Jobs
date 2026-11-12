import sql from '../lib/sql.js';
import { planOf } from '../config/plans.js';
import { vagasDoFeed } from './feedCache.js';
import { idsComDislike } from './jobFeedback.js';
import { candidatasDoPerfil, shapeJob, getMatches, invalidateMatches } from './jobsQuery.js';
import { umaPorRecrutador, contatadosRecentes } from './mesmoRecrutador.js';
import { variantesDoPerfil, melhoresSugestoes, temPoucaVaga } from './ampliarPerfilLogic.js';
import { esquecerVagasPorLink } from './vagasPorLink.js';

// =========================
// "Seu perfil tem pouca vaga" (Vagas): quanto cada mudança no perfil traria
// =========================
// Mede no feed REAL da pessoa: as mesmas vagas em memória, as mesmas que ela já
// enviou ou recusou, um currículo por recrutador. Só calcula para quem tem pouca
// vaga, e guarda 10 minutos por pessoa: são alguns filtros sobre ~10 mil vagas.

const GUARDA_MS = 10 * 60 * 1000;
const memo = new Map();

async function contexto(userId) {
    const [perfil] = await sql`select * from "Profiles" where "UserId" = ${userId}`;
    const candidaturas = await sql`select "JobId" from "Applications" where "UserId" = ${userId}`;
    const resolvidas = new Set([...candidaturas.map((r) => String(r.JobId)), ...await idsComDislike(userId)]);
    return { perfil, resolvidas, contatados: await contatadosRecentes(userId), vagas: await vagasDoFeed() };
}

function contar(ctx, perfil) {
    const lista = candidatasDoPerfil(ctx.vagas, perfil, ctx.resolvidas)
        .map((j) => shapeJob(j, perfil, new Set()))
        .sort((a, b) => b.matchScore - a.matchScore);
    return umaPorRecrutador(lista, ctx.contatados).length;
}

/** { total, pouca, sugestoes: [{ id, texto, ganho }] } */
export async function sugestoesDePerfil(user) {
    const guardado = memo.get(user.Id);
    if (guardado && Date.now() - guardado.em < GUARDA_MS) return guardado.valor;
    const total = (await getMatches(user.Id)).length;
    const limite = planOf(user.Plan).dailyLimit;
    let valor = { total, pouca: false, sugestoes: [] };
    if (temPoucaVaga(total, limite)) {
        const ctx = await contexto(user.Id);
        if (ctx.perfil) {
            const medidas = variantesDoPerfil(ctx.perfil).map((v) => ({
                id: v.id, texto: v.texto, ganho: contar(ctx, { ...ctx.perfil, ...v.patch }) - total,
            }));
            valor = { total, pouca: true, sugestoes: melhoresSugestoes(medidas) };
        }
    }
    memo.set(user.Id, { em: Date.now(), valor });
    if (memo.size > 1000) memo.delete(memo.keys().next().value);
    return valor;
}

/** Aplica a sugestão `id` no perfil. O servidor recalcula o patch: o cliente só escolhe. */
export async function aplicarSugestao(user, id) {
    const [perfil] = await sql`select * from "Profiles" where "UserId" = ${user.Id}`;
    const v = perfil && variantesDoPerfil(perfil).find((x) => x.id === id);
    if (!v) return { aplicada: false };
    const p = v.patch;
    if (p.Levels) await sql`update "Profiles" set "Levels" = ${sql.json(p.Levels)}, "UpdatedAt" = now() where "UserId" = ${user.Id}`;
    if (p.Areas) await sql`update "Profiles" set "Areas" = ${sql.json(p.Areas)}, "UpdatedAt" = now() where "UserId" = ${user.Id}`;
    if (p.Modalities) await sql`update "Profiles" set "Modalities" = ${sql.json(p.Modalities)}, "UpdatedAt" = now() where "UserId" = ${user.Id}`;
    if (p.PostingDays != null) await sql`update "Profiles" set "PostingDays" = ${p.PostingDays}, "UpdatedAt" = now() where "UserId" = ${user.Id}`;
    if (p.Region) await sql`update "Profiles" set "Region" = ${p.Region}, "UpdatedAt" = now() where "UserId" = ${user.Id}`;
    invalidateMatches(user.Id);
    esquecerVagasPorLink(user.Id);
    memo.delete(user.Id);
    const total = (await getMatches(user.Id)).length;
    console.log(`📈 perfil ampliado: user ${user.Id}, "${v.texto}" → ${total} vagas`);
    return { aplicada: true, texto: v.texto, total };
}
