import sql from '../lib/sql.js';

// =========================
// Mural de feedback: pedido, votos e respostas
// =========================
// Votos e respostas vêm da migration 0021. Até ela existir o mural segue igual,
// só sem os botões: consultar tabela inexistente derrubaria a rota.

export const ENVIOS_PARA_PEDIR = 10;
// Decisão do dono: só contam os envios a partir daqui. Sem isso, todo mundo que já
// tinha 10 envios receberia o pedido de uma vez.
const PEDIDO_VALE_DESDE = '2026-11-06T04:00:00Z';
const RESPOSTAS_POR_HORA = 20;

/** Pede feedback a quem já usou de verdade e ainda não deixou o seu. */
export function devePedirFeedback({ enviados, jaDeu }) {
    return !jaDeu && enviados >= ENVIOS_PARA_PEDIR;
}

/** "Maria da Silva" vira "Maria S.": o mural é público, igual ao ranking. */
export function abreviarNome(nome) {
    const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return 'Usuário';
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes.at(-1)[0].toUpperCase()}.`;
}

/** Junta votos e respostas por relato. Puro de propósito, para ter teste. */
export function montarInteracoes(ids, votos, respostas, uid) {
    const porId = new Map(ids.map((id) => [String(id), { likes: 0, dislikes: 0, meuVoto: 0, comentarios: [] }]));
    for (const v of votos) {
        const i = porId.get(String(v.FeedbackId));
        if (!i) continue;
        if (v.Voto === 1) i.likes += 1; else i.dislikes += 1;
        if (v.UserId === uid) i.meuVoto = v.Voto;
    }
    for (const r of respostas) {
        porId.get(String(r.FeedbackId))?.comentarios.push({
            id: r.Id, author: abreviarNome(r.Author), message: r.Mensagem, createdAt: r.CreatedAt, mine: r.UserId === uid,
        });
    }
    return porId;
}

let disponivel = false;
let checadoEm = 0;

/** As tabelas existem? Cache de 1 min enquanto não existem (para notar a migration). */
export async function interacaoDisponivel() {
    if (disponivel || !sql) return disponivel;
    if (Date.now() - checadoEm < 60_000) return false;
    const [r] = await sql`select to_regclass('public."FeedbackComentarios"') is not null as ok`;
    disponivel = !!r.ok;
    checadoEm = Date.now();
    return disponivel;
}

export async function interacoesDoMural(ids, uid) {
    const votos = await sql`select "FeedbackId", "UserId", "Voto" from "FeedbackVotos" where "FeedbackId" = any(${ids}::bigint[])`;
    const respostas = await sql`
        select c."Id", c."FeedbackId", c."UserId", c."Mensagem", c."CreatedAt", u."Name" as "Author"
        from "FeedbackComentarios" c join "Users" u on u."Id" = c."UserId"
        where c."FeedbackId" = any(${ids}::bigint[])
        order by c."CreatedAt" asc limit 500`;
    return montarInteracoes(ids, votos, respostas, uid);
}

export async function perguntarFeedback(userId) {
    const [r] = await sql`
        select (select count(*)::int from "Applications" where "UserId" = ${userId} and "CreatedAt" >= ${PEDIDO_VALE_DESDE}::timestamptz) as enviados,
               exists (select 1 from "Feedback" where "UserId" = ${userId}) as "jaDeu"`;
    return devePedirFeedback(r);
}

/** Voto 0 tira o voto. */
export async function votar(feedbackId, userId, voto) {
    if (voto === 0) {
        await sql`delete from "FeedbackVotos" where "FeedbackId" = ${feedbackId} and "UserId" = ${userId}`;
        return;
    }
    await sql`
        insert into "FeedbackVotos" ("FeedbackId", "UserId", "Voto") values (${feedbackId}, ${userId}, ${voto})
        on conflict ("FeedbackId", "UserId") do update set "Voto" = excluded."Voto"`;
}

/** Devolve false se a pessoa passou do limite: o mural é público e aberto a todos. */
export async function responder(feedbackId, userId, mensagem) {
    const [{ n }] = await sql`
        select count(*)::int as n from "FeedbackComentarios"
        where "UserId" = ${userId} and "CreatedAt" > now() - interval '1 hour'`;
    if (n >= RESPOSTAS_POR_HORA) return false;
    await sql`insert into "FeedbackComentarios" ("FeedbackId", "UserId", "Mensagem") values (${feedbackId}, ${userId}, ${mensagem})`;
    return true;
}
