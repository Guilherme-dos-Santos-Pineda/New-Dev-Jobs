import sql from '../lib/sql.js';

// =========================
// Quem é recrutador monitorável (definição única)
// =========================
// A regra mudou em 04/10/2026: **ter vaga na base É a prova**. Antes era
// `Status = 'approved'`, e o efeito medido foi que de 5546 recrutadores só 36
// estavam aprovados; o robô visitava esses 36 enquanto 4220 que JÁ tinham
// gerado vaga com email válido ficavam parados num estado que ninguém lembrava
// de mudar. Exigir que um humano confirme o que o banco já provou é burocracia
// que só cria fila.
//
// A decisão humana que sobrou é a de TIRAR alguém, não a de deixar entrar:
// `rejected` continua excluindo. Sem isso, um recrutador rejeitado voltaria
// sozinho assim que tivesse uma vaga antiga na base.
//
// `approved` continua valendo por cima, para incluir à mão quem ainda não
// gerou vaga (recrutador novo que se quer acompanhar).
//
// ---------------------------------------------------------------------------
// Por que isto vive num arquivo só
// ---------------------------------------------------------------------------
// A mesma pergunta é feita em TRÊS lugares: o scraper (para montar o lote),
// o painel do admin e o KPI do dashboard. Com a regra escrita três vezes, a
// primeira mudança em uma delas faz o número na tela contradizer o que o robô
// faz, e ninguém percebe porque os dois "funcionam". É o mesmo problema das
// três pontas de área do projeto.

/**
 * Condição SQL de recrutador monitorável, para colar numa consulta sobre
 * "Recruiters" com o alias `r`.
 *
 * Uso: sql`select ... from "Recruiters" r where ${condicaoMonitoravel()}`
 */
export function condicaoMonitoravel() {
    return sql`
        r."LinkedinUrl" is not null and r."LinkedinUrl" <> ''
        and coalesce(r."Status", '') <> 'rejected'
        and (
            r."Status" = 'approved'
            or exists (
                select 1 from "Jobs" j
                where j."RecruiterId" = r."Id" and j."Email" like '%@%.%'
                  -- vaga BR: 3569 dos 4256 recrutadores só tinham vaga de fora
                  -- (vieram das antigas buscas em inglês) e levariam 84% do
                  -- crédito para um produto que é brasileiro.
                  and j."IsBR" is not false
            )
        )`;
}

/** Quantos recrutadores o robô pode visitar hoje. */
export async function contarMonitoraveis() {
    const [row] = await sql`
        select count(*)::int as n from "Recruiters" r where ${condicaoMonitoravel()}`;
    return row.n;
}

/** Não revisitar antes disto: casa com o `postedLimit: 'week'` do robô. */
export const DIAS_ENTRE_VISITAS = 6;

/**
 * O próximo lote a visitar: os mais PRODUTIVOS primeiro, entre os que não
 * foram visitados nos últimos DIAS_ENTRE_VISITAS.
 *
 * Por que produtividade e não "o mais obsoleto": o crédito da Apify paga
 * ~240 posts por dia, e um recrutador ativo publica ~20 por semana. Isso cobre
 * uns 140 recrutadores por semana, não 4 mil. Girar a base inteira por ordem de
 * `LastCheckedAt` gastava o crédito visitando quem não posta há meses (medido:
 * 10 recrutadores do topo deram 79 vagas com email numa semana; a média da base
 * dá perto de zero).
 *
 * "Produtivo" = vagas BR de tecnologia com email nos últimos 90 dias, depois no total. Recrutador
 * novo achado pela busca de descoberta entra com vaga recente e sobe sozinho; o
 * que parou de postar cai sozinho quando a janela de 90 dias passa por ele.
 *
 * A janela de revisita evita pagar duas vezes pelo mesmo post: o robô pede os
 * posts da última semana, então voltar antes de 6 dias recompra o que já veio.
 *
 * @param {number|null} limite  teto de recrutadores por run
 */
export async function proximosMonitoraveis(limite) {
    const rows = await sql`
        with prod as (
            select j."RecruiterId" as id,
                   count(*) filter (where j."CreatedAt" > now() - interval '90 days')::int as recentes,
                   count(*)::int as total
            from "Jobs" j
            where j."RecruiterId" is not null and j."Email" like '%@%.%'
              and j."IsBR" is true   -- produto é BR: recrutador indiano produtivo não interessa
              -- e vaga de TECNOLOGIA: tem recrutador que posta 30 vagas por
              -- semana de logística e RH. Contá-las gastaria o crédito nele.
              and coalesce(j."Area", 'other') not in ('nontech', 'other')
            group by 1
        )
        select r."LinkedinUrl" from "Recruiters" r
        left join prod p on p.id = r."Id"
        where ${condicaoMonitoravel()}
          and (r."LastCheckedAt" is null
               or r."LastCheckedAt" < now() - make_interval(days => ${DIAS_ENTRE_VISITAS}))
        order by coalesce(p.recentes, 0) desc, coalesce(p.total, 0) desc,
                 r."LastCheckedAt" asc nulls first, r."Id" asc
        ${limite && limite > 0 ? sql`limit ${limite}` : sql``}`;
    return rows.map((r) => r.LinkedinUrl);
}
