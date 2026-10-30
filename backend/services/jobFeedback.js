import sql from '../lib/sql.js';

// =========================
// 👍 / 👎 nas vagas
// =========================
// O 👎 tira a vaga do feed DAQUELA pessoa, na hora. Registrar opinião sem efeito
// nenhum ensina o usuário a não se dar ao trabalho; ver a vaga sumir ensina que
// vale a pena. O motivo é para o admin: vaga com vários "não é de TI" vai para
// o botão "Não é TI", que tira do feed de todo mundo.
//
// A tabela vem da migration 0017, que o dono aplica em produção. Até lá o recurso
// fica ESCONDIDO e o feed segue igual: consultar uma tabela que não existe
// derrubaria o feed de todos, então tudo passa por feedbackDisponivel().

export const MOTIVOS = {
    area: 'Não é da minha área',
    nivel: 'Nível não combina comigo',
    nao_ti: 'Não é vaga de tecnologia',
    ruim: 'Vaga estranha ou suspeita',
};

let disponivel = null;
let checadoEm = 0;

/** A tabela existe? Cache de 1 min enquanto não existe (para notar a migration). */
export async function feedbackDisponivel() {
    if (disponivel === true || !sql) return !!(disponivel && sql);
    if (disponivel === false && Date.now() - checadoEm < 60_000) return false;
    const [r] = await sql`select to_regclass('public."JobFeedback"') is not null as ok`;
    disponivel = !!r.ok;
    checadoEm = Date.now();
    return disponivel;
}

/**
 * Pedaço de SQL que exclui do feed o que o usuário marcou com 👎. Usado por
 * buscarCandidatas E pelo diagnóstico do admin, que precisam cortar igual.
 *
 * É SÍNCRONO de propósito, e recebe `ativo` de quem chamou (await
 * feedbackDisponivel()). Um fragmento do postgres.js é "thenable": devolvido
 * por uma função async, o `await` do chamador EXECUTA o fragmento sozinho como
 * consulta ("syntax error at or near $3"), e o feed de todo mundo cai. Foi
 * exatamente o que a primeira versão fez.
 */
export function semDislikeSql(userId, ativo) {
    if (!ativo) return sql``;
    return sql`and not exists (
        select 1 from "JobFeedback" f
        where f."UserId" = ${userId} and f."JobId" = j."Id" and f."Voto" = -1
    )`;
}

/** voto: 1, -1 ou 0 (desfaz). */
export async function votar(userId, jobId, voto, motivo) {
    if (voto === 0) {
        await sql`delete from "JobFeedback" where "UserId" = ${userId} and "JobId" = ${jobId}`;
        return;
    }
    const m = voto === -1 && MOTIVOS[motivo] ? motivo : null;
    await sql`
        insert into "JobFeedback" ("UserId", "JobId", "Voto", "Motivo")
        values (${userId}, ${jobId}, ${voto}, ${m})
        on conflict ("UserId", "JobId") do update
            set "Voto" = excluded."Voto", "Motivo" = excluded."Motivo", "CreatedAt" = now()`;
}

/** As vagas que o usuário marcou com 👍 (as com 👎 nem aparecem mais). */
export async function meusLikes(userId) {
    const rows = await sql`select "JobId" from "JobFeedback" where "UserId" = ${userId} and "Voto" = 1`;
    return rows.map((r) => String(r.JobId));
}
