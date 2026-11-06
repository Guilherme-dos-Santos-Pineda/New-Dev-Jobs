// =========================
// Chaves de funcionalidade do front
// =========================
// ESPELHA backend/config/filtroData.js. O bundle do navegador nao importa
// codigo do backend, entao a constante vive nos dois lugares.
//
// Ao religar, mude NOS DOIS. Ligar so aqui devolve o seletor para a tela sem
// o filtro funcionar; ligar so la filtra sem a pessoa conseguir configurar.
// O motivo de estar desligada esta escrito em backend/config/filtroData.js.
export const FILTRO_DATA_ATIVO = false;

// ESPELHA backend/config/planosPagos.js (o motivo está escrito lá). Desligada:
// some a página de assinatura e todo convite a pagar. Mude NOS DOIS.
export const PLANOS_PAGOS_ATIVOS = true;
