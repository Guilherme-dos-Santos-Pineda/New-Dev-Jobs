// =========================
// Filtro de data: LIGADO desde 07/11/2026
// =========================
// Ficou desligado de 30/09 a 07/11/2026 (decisão do dono): com o scraper parado,
// um filtro de "últimos N dias" esvaziava sozinho até dar zero. Medido num usuário
// real com "últimos 60 dias": de 2111 vagas sobravam 384. Voltou porque a base
// recebe vaga de novo (285 de TI em 7 dias) e pediram no Reddit.
//
// Se o scraper parar de novo por mais de alguns dias, desligue aqui e em
// frontend/src/lib/flags.js. O valor de cada pessoa fica salvo em `PostingDays`.
//
// A chave vale para o SQL e para o JS ao mesmo tempo. Ligar num e esquecer o outro
// faz o SQL ficar mais restritivo que o JS, que é o jeito de sumir com vaga boa em
// silêncio (ver `npm run check:feed`).
export const FILTRO_DATA_ATIVO = true;
