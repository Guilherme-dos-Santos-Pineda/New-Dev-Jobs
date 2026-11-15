import sql from '../lib/sql.js';
import {
    gerarCodigo, normalizarCodigo, podeIndicar, premioVale, origemParaGravar, limparCanal,
    BONUS_ENVIOS, DIAS_POR_INDICACAO, TETO_DIAS, HORAS_PARA_INDICAR,
} from './indicacaoLogic.js';

// =========================
// Origem, visitas e "Indique e ganhe": a parte com banco (regra em indicacaoLogic.js)
// =========================

const SITE = 'https://newdevjobs.xyz';

/** O código da pessoa, criado no primeiro pedido. */
export async function codigoDe(userId) {
    const [u] = await sql`select "CodigoIndicacao" from "Users" where "Id" = ${userId}`;
    if (u?.CodigoIndicacao) return u.CodigoIndicacao;
    for (let i = 0; i < 5; i++) {
        try {
            const [r] = await sql`
                update "Users" set "CodigoIndicacao" = ${gerarCodigo()}
                where "Id" = ${userId} and "CodigoIndicacao" is null returning "CodigoIndicacao"`;
            if (r) return r.CodigoIndicacao;
            const [ja] = await sql`select "CodigoIndicacao" from "Users" where "Id" = ${userId}`;
            return ja?.CodigoIndicacao || null; // outra requisição gravou primeiro
        } catch (e) {
            if (e.code !== '23505') throw e; // código repetido: sorteia outro
        }
    }
    throw new Error('não deu para gerar o código de indicação');
}

/** Tela "Indique e ganhe". */
export async function painelIndicacao(userId) {
    const codigo = await codigoDe(userId);
    const [n] = await sql`
        select count(*)::int as indicados,
               count(*) filter (where "IndicacaoPremiadaEm" is not null)::int as premiados
        from "Users" where "IndicadoPor" = ${userId}`;
    const [u] = await sql`select "BonusEnviosAte", "IndicadoPor", "IndicacaoPremiadaEm" from "Users" where "Id" = ${userId}`;
    const ate = u?.BonusEnviosAte && new Date(u.BonusEnviosAte) > new Date() ? u.BonusEnviosAte : null;
    return {
        codigo,
        link: `${SITE}/?ref=${codigo}`,
        indicados: n.indicados,
        premiados: n.premiados,
        bonusAte: ate,
        // Quem foi indicado e ainda não mandou o primeiro currículo: o bônus dele está esperando.
        bonusEsperando: !!u?.IndicadoPor && !u?.IndicacaoPremiadaEm,
        regra: { envios: BONUS_ENVIOS, dias: DIAS_POR_INDICACAO, teto: TETO_DIAS },
    };
}

/**
 * Depois do login, o navegador manda o que guardou da primeira visita. A origem
 * entra uma vez só e só em conta nova (conta antiga não sabe mais de onde veio);
 * a indicação segue `podeIndicar`.
 */
export async function registrarOrigem(user, { origem, ref } = {}) {
    const recente = Date.now() - new Date(user.CreatedAt).getTime() <= HORAS_PARA_INDICAR * 3600000;
    const out = { origem: false, indicacao: false };
    if (recente && !user.Origem && origem && typeof origem === 'object') {
        const o = origemParaGravar({ ...origem, ref: ref || origem.ref });
        const r = await sql`update "Users" set "Origem" = ${sql.json(o)} where "Id" = ${user.Id} and "Origem" is null returning "Id"`;
        out.origem = r.length > 0;
    }
    const codigo = normalizarCodigo(ref);
    if (codigo && !user.IndicadoPor) {
        const [quem] = await sql`select "Id" from "Users" where "CodigoIndicacao" = ${codigo}`;
        const [env] = await sql`select count(*)::int n from "Applications" where "UserId" = ${user.Id}`;
        if (podeIndicar({ indicado: user, quemIndicou: quem, jaEnviou: env.n > 0 })) {
            const r = await sql`
                update "Users" set "IndicadoPor" = ${quem.Id}
                where "Id" = ${user.Id} and "IndicadoPor" is null returning "Id"`;
            out.indicacao = r.length > 0;
        }
    }
    return out;
}

/**
 * Primeiro envio real (Gmail) de quem foi indicado: os dois ganham o bônus.
 * O sender só chama quando a linha tem IndicadoPor e ainda não foi premiada,
 * então isto não custa consulta nenhuma nos outros envios.
 */
export async function premiarIndicacao(userId) {
    const [indicado] = await sql`
        select "Id", "Email", "GoogleEmail", "IndicadoPor", "IndicacaoPremiadaEm" from "Users" where "Id" = ${userId}`;
    if (!indicado?.IndicadoPor) return false;
    const [quem] = await sql`select "Id", "Email", "GoogleEmail" from "Users" where "Id" = ${indicado.IndicadoPor}`;
    if (!premioVale({ indicado, quemIndicou: quem })) return false;
    return sql.begin(async (tx) => {
        // A marca vem primeiro e com a condição: dois envios ao mesmo tempo premiam uma vez.
        const marcou = await tx`
            update "Users" set "IndicacaoPremiadaEm" = now()
            where "Id" = ${userId} and "IndicacaoPremiadaEm" is null returning "Id"`;
        if (!marcou.length) return false;
        // Mesma conta de novoBonusAte (indicacaoLogic.js): soma 7 dias ao que sobrou, até 60 à frente.
        await tx`
            update "Users" set "BonusEnviosAte" = least(
                greatest(coalesce("BonusEnviosAte", now()), now()) + make_interval(days => ${DIAS_POR_INDICACAO}),
                now() + make_interval(days => ${TETO_DIAS}))
            where "Id" = any(${[userId, quem.Id]}::uuid[])`;
        console.log(`🎁 indicação premiada: ${quem.Id} indicou ${userId}`);
        return true;
    });
}

// =========================
// Visitas por canal
// =========================
// Uma por navegador por dia (o navegador lembra que já contou). Soma em memória e
// grava de 5 em 5 minutos, uma linha por canal: a landing não vira uma consulta por
// visita. Reinício perde no máximo os últimos 5 minutos de contagem.
const pendentes = new Map();
const MAX_CANAIS = 300;

export function contarVisita(canal) {
    let c = limparCanal(canal) || 'direto';
    if (!pendentes.has(c) && pendentes.size >= MAX_CANAIS) c = 'outro';
    pendentes.set(c, (pendentes.get(c) || 0) + 1);
}

export async function gravarVisitas() {
    if (!pendentes.size) return;
    const lote = [...pendentes];
    pendentes.clear();
    const canais = lote.map(([c]) => c);
    const qtds = lote.map(([, n]) => n);
    try {
        await sql`
            insert into "VisitasDiarias" ("Dia", "Canal", "Visitas")
            select current_date, c, n from unnest(${canais}::text[], ${qtds}::int[]) as t(c, n)
            on conflict ("Dia", "Canal") do update set "Visitas" = "VisitasDiarias"."Visitas" + excluded."Visitas"`;
    } catch (e) {
        // Banco fora: devolve para a próxima rodada em vez de perder.
        for (const [c, n] of lote) pendentes.set(c, (pendentes.get(c) || 0) + n);
        console.warn('visitas: não gravou agora:', e.message);
    }
}

let timer = null;
export function iniciarGravacaoDeVisitas() {
    if (timer || !sql) return;
    timer = setInterval(() => { gravarVisitas().catch(() => {}); }, 5 * 60 * 1000);
    timer.unref?.();
}
