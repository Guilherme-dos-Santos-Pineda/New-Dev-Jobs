// =========================
// Planos pagos: LIGADOS ou DESLIGADOS (chave única)
// =========================
// Desligados em 29/10/2026 e ligados de novo em 06/11/2026, por decisão do dono,
// com o plano Automático de R$ 10. O grátis não mudou: 20 por dia e vaga a vaga.
//
// PARA DERRUBAR: reverta o commit da abertura, que desfaz esta chave, a de
// frontend/src/lib/flags.js e os textos da landing juntos. Ligar em um só lugar
// deixa o app oferecendo plano que o backend recusa, ou o contrário. Quem já
// comprou não perde nada.
export const PLANOS_PAGOS_ATIVOS = true;

// Compra de verdade antes de abrir para todos. Quem está aqui vê a página de
// assinatura e passa pelo checkout mesmo com a chave desligada; o resto, não.
const COMPRA_EM_TESTE = ['guilhermesantospineda@gmail.com'];

export const compraLiberada = (email) => PLANOS_PAGOS_ATIVOS || COMPRA_EM_TESTE.includes(String(email || '').toLowerCase());

/** Limites do plano grátis, com a venda aberta ou não. */
export const FREE_SEM_PLANOS_PAGOS = { dailyLimit: 20, allowManual: true };
