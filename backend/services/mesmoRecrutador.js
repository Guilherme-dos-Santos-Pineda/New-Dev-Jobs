import sql from '../lib/sql.js';

// =========================
// Um currículo por recrutador a cada 30 dias
// =========================
// Medido em 02/11/2026: uma pessoa tinha mandado 11 currículos para
// vagas@innolevels.com.br, outra 13 para o mesmo RH. Para o recrutador é a
// mesma pessoa repetida, e o caminho natural é marcar como spam, o que derruba
// a reputação do Gmail DE QUEM ENVIA (e a entrega de todo o resto).
//
// Duas travas, com a mesma regra:
//  • no feed (getMatches): sobra UMA vaga por recrutador, a de maior match, e
//    some quem já recebeu nos últimos 30 dias. Assim o envio automático, a
//    seleção manual e o "enviar você mesmo", que só aceitam vaga do feed, já
//    nascem sem repetição.
//  • no envio (applyToJob): autoridade final, para o que não passa pelo feed
//    (destaques, fila antiga).

export const DIAS_MESMO_RECRUTADOR = 30;

/** Endereços de um campo Email ("a@x.com, b@y.com" vira dois), normalizados. */
export function enderecos(campo) {
    return String(campo || '').toLowerCase().split(/[\s,;]+/).filter((e) => e.includes('@'));
}

/**
 * Deixa uma vaga por recrutador, na ordem recebida (a primeira vence), e tira
 * as de quem já foi contatado. Duas vagas são do mesmo recrutador se dividem
 * QUALQUER endereço.
 */
export function umaPorRecrutador(vagas, contatados = []) {
    const vistos = new Set(contatados);
    const saida = [];
    for (const v of vagas) {
        const ends = enderecos(v.email ?? v.Email);
        if (ends.some((e) => vistos.has(e))) continue;
        for (const e of ends) vistos.add(e);
        saida.push(v);
    }
    return saida;
}

/** Endereços para os quais o usuário mandou currículo nos últimos 30 dias. */
export async function contatadosRecentes(userId) {
    const rows = await sql`
        select j."Email" from "Applications" a
        join "Jobs" j on j."Id" = a."JobId"
        where a."UserId" = ${userId} and j."Email" is not null
          and a."SentAt" > now() - make_interval(days => ${DIAS_MESMO_RECRUTADOR})`;
    return [...new Set(rows.flatMap((r) => enderecos(r.Email)))];
}

/** O usuário já mandou para algum endereço desta vaga nos últimos 30 dias? */
export async function jaContatado(userId, campoEmail) {
    const ends = enderecos(campoEmail);
    if (!ends.length) return false;
    const contatados = new Set(await contatadosRecentes(userId));
    return ends.some((e) => contatados.has(e));
}
