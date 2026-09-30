// =========================
// Filtro de data de postagem — DESLIGADO por ora
// =========================
// Decisão do dono em 30/09/2026: desligar temporariamente. Vai voltar.
//
// Por que saiu agora: o scraper está parado por falta de crédito da Apify, e
// nenhuma vaga nova entra desde 12/09. Um filtro de "últimos N dias" sobre uma
// base que não recebe nada é um filtro que esvazia sozinho, todo dia, até
// chegar em zero. Medido num usuário real com "últimos 60 dias": de 2111 vagas
// candidatáveis sobravam 384, ou seja, o filtro sozinho cortava 82% — e ele
// reclamou justamente de achar pouca vaga.
//
// COMO LIGAR DE VOLTA: mude para `true`. Só isso.
//
// O que NÃO foi feito, de propósito:
//   - O valor de cada pessoa continua salvo na coluna `PostingDays`. Ninguém
//     perde a configuração, e quando voltar a chave todo mundo recupera o que
//     tinha escolhido, sem precisar preencher de novo.
//   - O código dos dois filtros (SQL e JS) continua onde estava, só guardado
//     atrás desta constante. Apagar e reescrever depois é como se perde o
//     detalhe de que os dois precisam concordar.
//
// IMPORTANTE ao religar: a chave vale para o SQL e para o JS ao mesmo tempo.
// Ligar num e esquecer o outro faz o SQL ficar mais restritivo que o JS, que é
// exatamente o jeito de sumir com vaga boa em silêncio (ver `npm run check:feed`).
export const FILTRO_DATA_ATIVO = false;
