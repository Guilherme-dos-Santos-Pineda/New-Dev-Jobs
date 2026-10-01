// =========================
// O email que a IA devolveu existe mesmo no post? (lógica pura)
// =========================
// Relato real: "o Kleber recebe alerta do Gmail dizendo que o endereço não
// existe". E os endereços PARECIAM certos, com nome de pessoa e domínio da
// empresa, então nada na tela denunciava o problema.
//
// Medido na base em 01/10/2026: de 7826 vagas com email, **382 tinham um
// endereço que NÃO aparece em lugar nenhum do post de origem**. A IA
// inventava. Os casos mais descarados eram placeholders de manual
// ("contato@empresa.com", "shanmugam@company.com", "mounika@example.com"),
// mas a maioria era pior: endereço plausível, com o domínio certo da empresa e
// um nome de pessoa que a IA deduziu do texto. Exemplo: um post que só tinha
// um link do LinkedIn virou "contato@empresa.com".
//
// Por que isso machuca mais do que parece: o email SAI da conta Gmail do
// usuário. Cada endereço inexistente volta como bounce para a caixa dele, e
// uma sequência de bounces é exatamente o sinal que o Gmail usa para rebaixar
// a reputação de quem envia. Ou seja: além de não chegar no recrutador, piora
// a entrega dos emails que estavam certos.
//
// A REGRA: a IA pode LER o email do post, nunca ESCREVER um.
// Se o endereço não aparece literalmente no texto, ele não existe.
//
// Isto não substitui `emailContato.js`, que valida a FORMA do endereço
// (telefone e link não são email). Aqui a pergunta é outra: a forma está certa,
// mas essa pessoa existe? Os dois juntos cobrem as duas falhas.

/** Domínios que são claramente exemplo de documentação, nunca uma empresa. */
const DOMINIOS_FALSOS = [
    'empresa.com', 'empresa.com.br', 'company.com', 'company.com.br',
    'example.com', 'example.org', 'exemplo.com', 'exemplo.com.br',
    'dominio.com', 'domain.com', 'email.com', 'seuemail.com',
    'test.com', 'teste.com', 'suaempresa.com', 'yourcompany.com',
];

/** O domínio é um placeholder de exemplo? */
export function ehDominioFalso(email) {
    const dom = String(email || '').toLowerCase().split('@')[1];
    if (!dom) return false;
    return DOMINIOS_FALSOS.includes(dom);
}

/**
 * Filtra o email que a IA devolveu, mantendo só o que está mesmo no post.
 *
 * Aceita lista separada por vírgula e devolve apenas as partes confirmadas:
 * um post pode trazer três emails de verdade e a IA acrescentar um quarto
 * inventado. Derrubar a lista inteira por causa do intruso perderia os três
 * bons; manter a lista inteira mandaria email para um endereço morto.
 *
 * A comparação ignora maiúsculas e espaços em volta, e nada mais. Qualquer
 * "correção" mais esperta aqui (tirar acento, trocar caractere parecido)
 * voltaria a aceitar endereço que não existe, que é o bug.
 *
 * @param {string|null|undefined} bruto  o que a IA devolveu
 * @param {string|null|undefined} texto  o conteúdo do post de origem
 * @returns {string|null} os endereços confirmados, ou null se nenhum
 */
export function emailConfirmadoNoTexto(bruto, texto) {
    if (typeof bruto !== 'string' || !bruto.trim()) return null;
    const fonte = String(texto || '').toLowerCase();
    if (!fonte) return null; // sem post para conferir, não dá para confiar

    const confirmados = bruto
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => !ehDominioFalso(p))
        .filter((p) => fonte.includes(p.toLowerCase()));

    return confirmados.length ? confirmados.join(', ') : null;
}
