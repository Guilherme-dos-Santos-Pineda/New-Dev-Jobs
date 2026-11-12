import sql from '../lib/sql.js';
import { estadoIa, validadeDaCompra, IA_DIAS, IA_TESTE_HORAS } from './iaLogic.js';
import { ajusteDe } from './analiseCv.js';

// =========================
// Plano de IA e teste de 48 h: a parte com banco (regra em iaLogic.js)
// =========================
// Funciona antes da migration 0029: sem as colunas, todo mundo fica como
// "novo" (pode testar) e nada é gravado, e a tela continua de pé.

let pronta = null;
let checadaEm = 0;
async function migrationAplicada() {
    if (!sql) return false;
    if (pronta === true) return true;
    if (pronta === false && Date.now() - checadaEm < 60_000) return false;
    const [r] = await sql`select to_regclass('public."CvIaUsos"') is not null as ok`;
    pronta = !!r.ok;
    checadaEm = Date.now();
    return pronta;
}

/** O estado da IA da pessoa, lido agora do banco (o req.user fica 60 s em cache). */
export async function estadoIaDe(userId, { admin = false } = {}) {
    const ajuste = await ajusteDe(userId).catch(() => ({ bloqueado: false, extras: 0 }));
    if (!(await migrationAplicada())) return { ...estadoIa({ admin }), bloqueado: ajuste.bloqueado };
    const [u] = await sql`select "IaAte", "IaDesde", "IaTesteDesde" from "Users" where "Id" = ${userId}`;
    const [usos] = await sql`
        select count(*) filter (where "CreatedAt" >= coalesce(${u?.IaDesde ?? null}::timestamptz, 'infinity'))::int as plano,
               count(*) filter (where "Tipo" = 'analise' and "CreatedAt" >= coalesce(${u?.IaTesteDesde ?? null}::timestamptz, 'infinity')
                                and "CreatedAt" < coalesce(${u?.IaTesteDesde ?? null}::timestamptz, 'infinity') + make_interval(hours => ${IA_TESTE_HORAS}))::int as teste_analise,
               count(*) filter (where "Tipo" = 'versao' and "CreatedAt" >= coalesce(${u?.IaTesteDesde ?? null}::timestamptz, 'infinity')
                                and "CreatedAt" < coalesce(${u?.IaTesteDesde ?? null}::timestamptz, 'infinity') + make_interval(hours => ${IA_TESTE_HORAS}))::int as teste_versao
        from "CvIaUsos" where "UserId" = ${userId}`;
    const e = estadoIa({
        agora: Date.now(), admin, iaAte: u?.IaAte, testeDesde: u?.IaTesteDesde,
        usosPlano: usos.plano, usosTeste: { analise: usos.teste_analise, versao: usos.teste_versao }, extras: ajuste.extras,
    });
    return { ...e, bloqueado: ajuste.bloqueado };
}

/** Conta um uso de IA. No primeiro uso de quem não tem plano, começa o teste de 48 h. */
export async function registrarUso(userId, tipo, estado) {
    if (!(await migrationAplicada())) return;
    await sql`insert into "CvIaUsos" ("UserId", "Tipo") values (${userId}, ${tipo})`;
    if (estado?.modo === 'novo') {
        await sql`update "Users" set "IaTesteDesde" = now() where "Id" = ${userId} and "IaTesteDesde" is null`;
    }
}

/**
 * Libera a IA por `dias` (compra, Automático ou admin). Com `sessao`, a mesma
 * compra que chega pelo webhook e pela volta do checkout só vale uma vez.
 */
export async function concederIa(userId, { dias = IA_DIAS, sessao = null, por = 'compra' } = {}) {
    if (!userId || !(await migrationAplicada())) return false;
    const [u] = await sql`select "IaAte", "IaUltimaSessao" from "Users" where "Id" = ${userId}`;
    if (!u) return false;
    if (sessao && u.IaUltimaSessao === sessao) return false;
    const { iaAte, iaDesde } = validadeDaCompra(u.IaAte, Date.now(), dias);
    const feito = await sql`
        update "Users" set "IaAte" = ${new Date(iaAte)}, "IaDesde" = ${new Date(iaDesde)},
            "IaUltimaSessao" = coalesce(${sessao}, "IaUltimaSessao")
        where "Id" = ${userId} and "IaUltimaSessao" is not distinct from ${u.IaUltimaSessao}
        returning "Id"`;
    if (!feito.length) return false;
    console.log(`✨ IA liberada: user ${userId} até ${new Date(iaAte).toISOString().slice(0, 10)} (${por})`);
    return true;
}

/** Quem comprou o Automático ganha a IA até o fim do plano (agradecimento, 11/11/2026). */
export async function iaJuntoDoPlano(userId, planoAte) {
    if (!userId || !planoAte || !(await migrationAplicada())) return;
    await sql`
        update "Users" set
            "IaDesde" = case when "IaAte" is null or "IaAte" < now() then now() else "IaDesde" end,
            "IaAte" = greatest(coalesce("IaAte", now()), ${new Date(planoAte)})
        where "Id" = ${userId}`;
}
