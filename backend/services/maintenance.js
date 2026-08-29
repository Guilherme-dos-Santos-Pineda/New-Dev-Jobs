import sql from '../lib/sql.js';
import { classifyJob, CLASSIFY_VERSION } from './classify.js';

// =========================
// Manutenção periódica (roda no worker, a cada MAINTENANCE_EVERY_MS)
// =========================
// Duas tarefas que ninguém vai lembrar de rodar à mão, e cujo esquecimento é
// silencioso: nada quebra, o sistema só vai degradando.

/** Quantas linhas classificar por passada. Pequeno: isto divide a VM com a API. */
const LOTE_CLASSIFICACAO = Number(process.env.RECLASSIFY_BATCH) || 300;

/**
 * Classifica as vagas com "ClassVersion" defasado.
 *
 * Rede de segurança para todo caminho de escrita que não classifica na hora
 * (importação por script, upsert que trocou a descrição, migration recém
 * aplicada). Sem ela, uma vaga com "Area" nula passaria pelo pré-filtro do SQL e
 * só seria barrada em JS — correto, mas devagar; e vaga nova ficaria sem índice.
 */
export async function reclassifyPending(limite = LOTE_CLASSIFICACAO) {
    const rows = await sql`
        select "Id", "JobTitle", "Description", "Skills", "Modality", "Location", "Email"
        from "Jobs" where "ClassVersion" < ${CLASSIFY_VERSION}
        order by "Id" desc limit ${limite}`;
    if (!rows.length) return 0;

    const valores = rows.map((j) => {
        const c = classifyJob(j);
        return [Number(j.Id), c.area, c.level, c.mods ? JSON.stringify(c.mods) : null, c.isBR];
    });
    await sql`
        update "Jobs" j set
            "Area" = v.area, "Level" = v.level,
            "Mods" = v.mods::jsonb, "IsBR" = v.isbr,
            "ClassVersion" = ${CLASSIFY_VERSION}
        from (values ${sql(valores)}) as v(id, area, level, mods, isbr)
        where j."Id" = v.id::bigint`;
    return rows.length;
}

// Retenção do rastro do scraper. "ScraperRuns" (15,7 mil linhas) e
// "ScrapedPosts" (10,7 mil) somavam 34 MB de 53 MB do banco — mais de 60% do
// espaço gasto guardando o log de execuções, não o produto. O plano gratuito do
// Supabase tem 500 MB; nesse ritmo o banco enche antes de o negócio começar.
//
// O que se perde: histórico de runs e o conteúdo bruto dos posts já processados.
// Post cujo processamento ainda não terminou ('pending') fica, independentemente
// da idade — apagá-lo perderia trabalho de verdade.
const RETENCAO_DIAS = Number(process.env.RETENTION_DAYS) || 45;

export async function pruneScraperHistory(dias = RETENCAO_DIAS) {
    const runs = await sql`
        delete from "ScraperRuns"
        where "CreatedAt" < now() - make_interval(days => ${dias})
          and "Status" in ('done', 'failed')
        returning "Id"`;
    const posts = await sql`
        delete from "ScrapedPosts"
        where "CreatedAt" < now() - make_interval(days => ${dias})
          and "Status" <> 'pending'
        returning "Id"`;
    return { runs: runs.length, posts: posts.length };
}

/** Uma passada completa. Nunca lança: manutenção não pode derrubar o worker. */
export async function runMaintenance() {
    const out = { classificadas: 0, runs: 0, posts: 0 };
    try {
        out.classificadas = await reclassifyPending();
    } catch (e) { console.error('reclassifyPending falhou:', e.message); }
    try {
        const p = await pruneScraperHistory();
        out.runs = p.runs; out.posts = p.posts;
    } catch (e) { console.error('pruneScraperHistory falhou:', e.message); }
    if (out.classificadas || out.runs || out.posts) {
        console.log(`🧹 manutenção: ${out.classificadas} vaga(s) classificada(s), ${out.runs} run(s) e ${out.posts} post(s) antigos removidos`);
    }
    return out;
}
