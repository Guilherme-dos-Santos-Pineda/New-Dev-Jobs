import sql from '../lib/sql.js';

// =========================
// "Alguém te respondeu?"
// =========================
// A permissão do Gmail é só de enviar: o app nunca vê a resposta do recrutador, e
// pedir leitura exigiria a auditoria do Google. Perguntar é o único jeito de saber
// se o produto funciona.
//
// A tabela vem da migration 0018, que o dono aplica em produção. Até lá o cartão
// não aparece: consultar tabela inexistente derrubaria a rota.

export const RESPOSTAS = ['nada', 'sim', 'emprego'];
export const DIAS_ATE_PERGUNTAR = 14;
export const DIAS_ENTRE_PERGUNTAS = 30;

const DIA_MS = 86400000;

/** Pergunta 14 dias depois do primeiro envio e de novo a cada 30, até "emprego". */
export function devePerguntar({ primeiroEnvio, ultimaResposta, ultimaEm, agora = Date.now() }) {
    if (!primeiroEnvio) return false;
    if (agora - new Date(primeiroEnvio).getTime() < DIAS_ATE_PERGUNTAR * DIA_MS) return false;
    if (ultimaResposta === 'emprego') return false;
    if (ultimaEm && agora - new Date(ultimaEm).getTime() < DIAS_ENTRE_PERGUNTAS * DIA_MS) return false;
    return true;
}

let disponivel = false;
let checadoEm = 0;

/** A tabela existe? Cache de 1 min enquanto não existe (para notar a migration). */
export async function retornoDisponivel() {
    if (disponivel || !sql) return disponivel;
    if (Date.now() - checadoEm < 60_000) return false;
    const [r] = await sql`select to_regclass('public."RetornoEnvios"') is not null as ok`;
    disponivel = !!r.ok;
    checadoEm = Date.now();
    return disponivel;
}

export async function perguntarAgora(userId) {
    if (!await retornoDisponivel()) return false;
    const [r] = await sql`
        select
            (select min("SentAt") from "Applications" where "UserId" = ${userId}) as "primeiroEnvio",
            u."Resposta" as "ultimaResposta",
            u."CreatedAt" as "ultimaEm"
        from (select 1) x
        left join lateral (
            select "Resposta", "CreatedAt" from "RetornoEnvios"
            where "UserId" = ${userId} order by "CreatedAt" desc limit 1
        ) u on true`;
    return devePerguntar(r);
}

/** Grava só se ainda for hora de perguntar: duplo clique não vira duas respostas. */
export async function responder(userId, resposta) {
    if (!await perguntarAgora(userId)) return false;
    await sql`insert into "RetornoEnvios" ("UserId", "Resposta") values (${userId}, ${resposta})`;
    return true;
}
