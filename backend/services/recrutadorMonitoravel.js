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
            )
        )`;
}

/** Quantos recrutadores o robô pode visitar hoje. */
export async function contarMonitoraveis() {
    const [row] = await sql`
        select count(*)::int as n from "Recruiters" r where ${condicaoMonitoravel()}`;
    return row.n;
}

/**
 * O próximo lote a visitar, os mais obsoletos primeiro.
 *
 * A ordem por `LastCheckedAt asc nulls first` é o que faz a rotação girar
 * sozinha: quem acabou de ser visitado vai para o fim da fila. Sem ela, o robô
 * visitaria sempre os mesmos dez.
 *
 * @param {number|null} limite  teto de recrutadores (10 = uma chamada Apify)
 */
export async function proximosMonitoraveis(limite) {
    const rows = await sql`
        select r."LinkedinUrl" from "Recruiters" r
        where ${condicaoMonitoravel()}
        order by r."LastCheckedAt" asc nulls first, r."Id" asc
        ${limite && limite > 0 ? sql`limit ${limite}` : sql``}`;
    return rows.map((r) => r.LinkedinUrl);
}
