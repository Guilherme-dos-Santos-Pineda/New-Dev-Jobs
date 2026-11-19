import sql from '../lib/sql.js';
import { enderecos } from './mesmoRecrutador.js';
import { motivoParaRecusar, deveBloquear, todosBloqueados } from './emailVoltouLogic.js';

// =========================
// "Esse email voltou": a parte com banco (regra em emailVoltouLogic.js)
// =========================
// O endereço bloqueado NÃO é apagado de "Jobs": Enviadas continua mostrando para
// quem foi, e desbloquear é só apagar a linha. Quem tira a vaga do feed é o
// computeMatches (jobsQuery.js), com o conjunto de vagas cujo email todo está aqui.

const GUARDA_MS = 10 * 60 * 1000;
let lista = null; // { em, set }
let porVaga = null; // { em, tamanho, versao, ids }
let versao = 0;

/** Os endereços bloqueados (em memória, 10 min; bloquear atualiza na hora). */
export async function emailsBloqueados() {
    if (lista && Date.now() - lista.em < GUARDA_MS) return lista.set;
    try {
        const rows = await sql`select "Email" from "EmailsBloqueados"`;
        lista = { em: Date.now(), set: new Set(rows.map((r) => r.Email)) };
    } catch {
        // Sem a tabela (antes da migration 0031): nada bloqueado.
        lista = { em: Date.now(), set: new Set() };
    }
    versao++;
    return lista.set;
}

/** Ids das vagas do feed cujo email inteiro está bloqueado. */
export async function vagasComEmailBloqueado(vagas) {
    const set = await emailsBloqueados();
    if (!set.size) return new Set();
    if (porVaga && porVaga.versao === versao && porVaga.tamanho === vagas.length) return porVaga.ids;
    const ids = new Set();
    for (const j of vagas) if (todosBloqueados(enderecos(j.Email), set)) ids.add(String(j.Id));
    porVaga = { versao, tamanho: vagas.length, ids };
    return ids;
}

export async function bloquearEmail(email, motivo) {
    await sql`insert into "EmailsBloqueados" ("Email", "Motivo") values (${email}, ${motivo}) on conflict ("Email") do nothing`;
    lista = null;
    console.log(`📪 email bloqueado (voltou): ${email} (${motivo})`);
}

export async function desbloquearEmail(email) {
    const r = await sql`delete from "EmailsBloqueados" where "Email" = ${String(email).toLowerCase()} returning "Email"`;
    lista = null;
    return r.length > 0;
}

/**
 * A pessoa avisa que o email de uma candidatura voltou. Devolve
 * { ok, bloqueados: [...] } ou { erro }.
 */
export async function avisarEmailVoltou(user, applicationId, { admin = false } = {}) {
    const [app] = await sql`
        select a."Id", a."Status", a."SentAt", j."Email"
        from "Applications" a join "Jobs" j on j."Id" = a."JobId"
        where a."Id" = ${applicationId} and a."UserId" = ${user.Id}`;
    const [h] = await sql`
        select count(*)::int n from "EmailsVoltaram"
        where "UserId" = ${user.Id} and "CreatedAt" > now() - interval '1 day'`;
    const recusa = motivoParaRecusar({ app, avisosHoje: admin ? 0 : h.n });
    if (recusa) return { erro: recusa };
    const ends = enderecos(app.Email);
    if (!ends.length) return { erro: 'Esta vaga não tem mais email.' };

    const bloqueados = [];
    for (const email of ends) {
        await sql`
            insert into "EmailsVoltaram" ("Email", "UserId", "ApplicationId") values (${email}, ${user.Id}, ${app.Id})
            on conflict ("UserId", "Email") do nothing`;
        const avisos = await sql`
            select v."UserId" as "userId", u."GoogleEmail" as "googleEmail", (u."Role" = 'admin') as "admin"
            from "EmailsVoltaram" v join "Users" u on u."Id" = v."UserId" where v."Email" = ${email}`;
        const comAdmin = admin ? [...avisos, { userId: user.Id, admin: true }] : avisos;
        if (deveBloquear(comAdmin)) {
            await bloquearEmail(email, admin ? 'admin' : `${avisos.length} avisos`);
            bloqueados.push(email);
        }
    }
    return { ok: true, bloqueados };
}

/** Admin: os bloqueados e os avisos que ainda não bastaram. */
export async function painelEmailsVoltaram() {
    const bloqueados = await sql`select "Email", "Motivo", "CreatedAt" from "EmailsBloqueados" order by "CreatedAt" desc limit 200`;
    const pendentes = await sql`
        select v."Email", count(*)::int as avisos, max(v."CreatedAt") as ultimo
        from "EmailsVoltaram" v left join "EmailsBloqueados" b on b."Email" = v."Email"
        where b."Email" is null group by v."Email" order by ultimo desc limit 200`;
    return { bloqueados, pendentes };
}
