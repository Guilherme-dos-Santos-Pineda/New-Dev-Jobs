// =========================
// "Esse email voltou" (regra pura, 19/11/2026)
// =========================
// Relato no grupo: um endereço da Randstad que não existe mais recebeu currículo
// de 14 pessoas, e cada uma tomou um bounce no próprio Gmail (bounce em sequência
// derruba a reputação de quem envia). Daqui não dá para saber se a CAIXA existe
// (emailDominio.js só pega domínio morto); quem recebe o bounce sabe.
//
// Contra quem sair avisando tudo: só avisa quem mandou de verdade pelo Gmail
// (Status 'sent') nos últimos 30 dias, no máximo 5 avisos por dia, e o endereço só
// é bloqueado com 2 pessoas diferentes (Gmails diferentes) ou com o admin.

export const AVISOS_POR_DIA = 5;
export const DIAS_PARA_AVISAR = 30;
export const PESSOAS_PARA_BLOQUEAR = 2;

/** Esta candidatura pode receber o aviso? Devolve o motivo da recusa, ou null. */
export function motivoParaRecusar({ app, avisosHoje }, agora = Date.now()) {
    if (!app) return 'Candidatura não encontrada.';
    if (app.Status !== 'sent') return 'Só dá para avisar sobre email enviado pelo seu Gmail.';
    const enviado = new Date(app.SentAt).getTime();
    if (!Number.isFinite(enviado) || agora - enviado > DIAS_PARA_AVISAR * 86400000) return 'Esse envio tem mais de 30 dias.';
    if (avisosHoje >= AVISOS_POR_DIA) return `Você já avisou ${AVISOS_POR_DIA} emails hoje. Tente amanhã.`;
    return null;
}

/**
 * Bloqueia? `avisos` são as pessoas que avisaram aquele endereço:
 * [{ userId, googleEmail, admin }]. Gmail repetido conta uma vez só.
 */
export function deveBloquear(avisos) {
    if (avisos.some((a) => a.admin)) return true;
    const pessoas = new Set(avisos.map((a) => String(a.googleEmail || a.userId).toLowerCase()));
    return pessoas.size >= PESSOAS_PARA_BLOQUEAR;
}

/** Todos os endereços da vaga estão bloqueados? (Vaga sem endereço não conta.) */
export function todosBloqueados(lista, bloqueados) {
    return lista.length > 0 && lista.every((e) => bloqueados.has(e));
}
