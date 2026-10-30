// =========================
// Planos pagos: LIGADOS ou DESLIGADOS (chave única)
// =========================
// Desligados em 29/10/2026 por decisão do dono, até o produto ter tração.
// Motivo: o feedback dos usuários foi que a ferramenta parecia "feita para
// tirar dinheiro de desempregado". Com a chave desligada:
//   - o plano grátis passa a 20 envios/dia e libera escolher vaga a vaga;
//   - /billing/plans só devolve o grátis e /billing/checkout recusa;
//   - o app esconde a página de assinatura e todo convite a pagar.
// Ninguém perde nada: quem já tem plano pago (concessão) continua com ele.
//
// PARA VOLTAR A COBRAR: troque para `true` AQUI e em frontend/src/lib/flags.js
// (o bundle não importa código do backend), e reexiba a seção de preços da
// landing (pages/index.html, `<div class="plans" hidden>`). Ligar em um só
// lugar deixa o app oferecendo plano que o backend recusa, ou o contrário.
export const PLANOS_PAGOS_ATIVOS = false;

/** O plano grátis enquanto os pagos estão desligados. */
export const FREE_SEM_PLANOS_PAGOS = { dailyLimit: 20, allowManual: true };
