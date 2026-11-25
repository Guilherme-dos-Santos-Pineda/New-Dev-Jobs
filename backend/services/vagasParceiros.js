import sql from '../lib/sql.js';
import { PARCEIRO, tirarVagaPorLink, atualizarVagasPorLinkJa } from './vagasPorLink.js';
import { validarVagaParceiro, conteudoDaVaga } from './vagasParceirosLogic.js';

// =========================
// Vagas de parceiros (Admin › Vagas de parceiros)
// =========================
// Nasceu do pedido de uma recrutadora (25/11/2026): ela pediu para tirar uma vaga
// antiga e ofereceu as novas, com candidatura por um formulário no Notion, "porque
// eles ficam no meu banco". Vira linha em "ScrapedPosts" com Source 'parceiro' e
// aparece em Vagas por link (vagasPorLink.js) para quem tem o perfil, antes das
// outras da semana. Sem migration. A retenção de 45 dias do scraper apaga a linha;
// a lista mostra só os últimos 30 dias, como as outras vagas por link.
//
// "Abriram": quantas pessoas clicaram em "Abrir vaga", guardado em AiResult
// (jsonb que essas linhas não usam). É o número que dá para contar à recrutadora.

export async function criarVagaParceiro(entrada, por) {
    const v = validarVagaParceiro(entrada);
    if (v.erro) return v;
    const d = v.dados;
    const [r] = await sql`
        insert into "ScrapedPosts" ("Source", "Author", "Url", "LinkedinId", "Content", "PostedAt", "Status", "AiResult")
        values (${PARCEIRO}, ${d.empresa}, ${d.link}, ${`parceiro:${Date.now()}`}, ${conteudoDaVaga(d)}, now(), 'approved',
                ${sql.json({ aberturas: 0, por, ...(entrada.contato ? { contato: String(entrada.contato).slice(0, 120) } : {}) })})
        returning "Id"`;
    atualizarVagasPorLinkJa();
    console.log(`🤝 vaga de parceiro ${r.Id}: ${d.titulo} (${d.empresa}) por ${por}`);
    return { id: Number(r.Id) };
}

export async function listarVagasParceiros() {
    const rows = await sql`
        select "Id", "Author", "Url", left("Content", 160) as "Inicio", "Status", "CreatedAt", "AiResult"
        from "ScrapedPosts" where "Source" = ${PARCEIRO} order by "Id" desc limit 100`;
    return rows.map((r) => ({
        id: Number(r.Id), empresa: r.Author, link: r.Url, titulo: String(r.Inicio || '').split('\n')[0],
        ativa: r.Status !== 'rejected', criadaEm: r.CreatedAt,
        aberturas: Number(r.AiResult?.aberturas) || 0, contato: r.AiResult?.contato || null,
    }));
}

export async function encerrarVagaParceiro(id) {
    const r = await sql`
        update "ScrapedPosts" set "Status" = 'rejected'
        where "Id" = ${id} and "Source" = ${PARCEIRO} returning "Id"`;
    if (r.length) tirarVagaPorLink(id);
    return r.length > 0;
}

// Uma vez por pessoa por vaga enquanto o processo vive (reinício pode contar de novo: é estimativa).
const contados = new Set();
export async function contarAbertura(postId, userId) {
    const chave = `${postId}:${userId}`;
    if (!Number.isFinite(Number(postId)) || contados.has(chave)) return;
    contados.add(chave);
    if (contados.size > 50_000) contados.clear();
    await sql`
        update "ScrapedPosts"
        set "AiResult" = jsonb_set(coalesce("AiResult", '{}'::jsonb), '{aberturas}',
                                   to_jsonb(coalesce(("AiResult"->>'aberturas')::int, 0) + 1))
        where "Id" = ${Number(postId)} and "Source" = ${PARCEIRO}`;
}
