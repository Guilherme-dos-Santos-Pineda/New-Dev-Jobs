// =========================
// O nome da pessoa: aparece no app, no {sender_name} do email e no "De:".
// =========================
// Até 11/11/2026 era gravado uma vez, no primeiro login (cadastro ou conta Google),
// e nada mudava depois: 40 de 322 contas tinham uma palavra só ("Gui") e mandavam
// "Me chamo Gui" para todo recrutador sem poder corrigir.

export const NOME_MIN = 2;
export const NOME_MAX = 80;

/** O nome digitado, limpo; null se não serve. Sem < > " para não virar HTML nem quebrar o cabeçalho do email. */
export function limparNome(valor) {
    const nome = String(valor ?? '')
        .normalize('NFC')
        .replace(/[\u0000-\u001F\u007F<>"\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (nome.length < NOME_MIN || nome.length > NOME_MAX) return null;
    if (!/\p{L}/u.test(nome)) return null; // só número ou símbolo não é nome
    return nome;
}

/**
 * O remetente do email: o endereço do Gmail conectado e o nome que a pessoa
 * escolheu. Sem nome, o Gmail mostra o da conta Google, como antes.
 */
export function remetente(user) {
    const address = user?.GoogleEmail || user?.Email;
    const name = limparNome(user?.Name);
    return name ? { name, address } : address;
}
