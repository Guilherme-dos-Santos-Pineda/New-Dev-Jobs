// =========================
// O email de contato da vaga é válido? (lógica pura)
// =========================
// Por que existe, com nome e sobrenome do estrago:
//
// O extrator às vezes grava QUALQUER COISA na coluna Email da vaga: telefone
// ("(11) 99153-5908"), link do LinkedIn ("https://lnkd.in/dPdbFCkV"), a palavra
// "informado", um id solto ("eUiAT4j2"). Medido em 30/09/2026: 230 vagas assim.
//
// O feed só exigia `Email <> ''`, então esse lixo era oferecido ao usuário,
// entrava na fila de envio, e o Gmail devolvia "Recipient address required" ou
// "Invalid To header". O worker classificava isso como falha TRANSITÓRIA e
// retentava: de 29/09 20:07 até 30/09 03:27, mais de 7 horas na mesma vaga.
// A linha ficava `queued` esse tempo todo, `getStatus` devolvia `active: true`,
// e o painel ficava pesquisando a cada 3 s com a barra de "enviando" parada.
// Foi assim que a tela "carregou infinitamente" para um usuário real.
//
// A consulta dos destaques JÁ tinha a trava (`Email like '%@%.%'`). O feed não.
// A correção existia num lugar e não no outro, que é o jeito mais caro de ter
// um bug: parece resolvido.
//
// ---------------------------------------------------------------------------
// SQL frouxo, JS rigoroso — nunca o contrário
// ---------------------------------------------------------------------------
// Vale a regra do projeto: o SQL não pode ser MAIS restritivo que o JS, senão
// some vaga boa em silêncio. Então o SQL usa o `like` largo daqui e o JS, que é
// a autoridade final, aplica a validação de verdade por cima. Confira com
// `npm run check:feed` ao mexer em qualquer um dos dois.

/** Padrão para o `like` do SQL. Largo de propósito: só derruba o que não tem
 *  cara de email nenhuma. O corte fino é do JS. */
export const LIKE_EMAIL = '%@%.%';

// Um endereço: sem espaço, sem vírgula, sem os delimitadores de cabeçalho, e
// com um TLD de letras. É o que basta para separar endereço de telefone/URL.
const UM_ENDERECO = /^[^\s@,;<>()[\]]+@[^\s@,;<>()[\]]+\.[A-Za-z]{2,}$/;

/**
 * O campo Email da vaga dá para mandar email?
 *
 * Aceita lista separada por vírgula (existem 137 vagas assim, e o Gmail aceita
 * várias no To), desde que TODAS as partes sejam endereços. Basta uma parte
 * ruim para o Gmail recusar a mensagem inteira, então lista meio certa é lista
 * errada.
 *
 * @param {string|null|undefined} bruto
 * @returns {boolean}
 */
export function emailDeContatoValido(bruto) {
    if (typeof bruto !== 'string') return false;
    const limpo = bruto.trim();
    if (!limpo) return false;
    const partes = limpo.split(',').map((p) => p.trim()).filter(Boolean);
    if (!partes.length) return false;
    return partes.every((p) => UM_ENDERECO.test(p));
}

// =========================
// O Gmail recusou por causa do DESTINATÁRIO?
// =========================
// Erro de destinatário é DEFINITIVO: o endereço da vaga não vai virar válido
// porque tentamos de novo. Tratar como transitório foi o que gerou as 7 horas
// de retentativa. Rede caindo e 5xx do Gmail continuam transitórios.
const RECUSA_DE_DESTINATARIO = [
    'recipient address required',
    'invalid to header',
    'invalid to',
    'invalid recipient',
    'address required',
    'malformed',
];

/**
 * O erro veio do endereço de destino (e portanto não adianta retentar)?
 * @param {unknown} erro
 */
export function ehErroDeDestinatario(erro) {
    const msg = String(erro?.message || erro || '').toLowerCase();
    if (!msg) return false;
    return RECUSA_DE_DESTINATARIO.some((t) => msg.includes(t));
}
