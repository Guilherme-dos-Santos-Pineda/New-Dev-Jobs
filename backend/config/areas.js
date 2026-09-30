// =========================
// Áreas: o que a pessoa escolhe x o que o classificador produz
// =========================
// Até 30/09/2026 existia UMA área de programação: 'dev'. Eram 4714 das 7826
// vagas com email, ou seja, front, back e full no mesmo balde. A queixa de um
// usuário real foi "acho pouquíssima vaga de front-end", e ele estava certo:
// não era filtro mal configurado, a categoria não existia.
//
// Agora o classificador produz 'frontend', 'backend', 'fullstack' e mantém
// 'dev' para o título genérico ("Desenvolvedor de Software", "Tech Lead"),
// que não dá para dividir sem chutar.

/** Áreas da família programação. 'dev' é a sobra, não um irmão qualquer. */
export const FAMILIA_DEV = ['dev', 'frontend', 'backend', 'fullstack'];

/**
 * Expande a escolha do usuário para o conjunto de áreas que ele deve receber.
 *
 * TRÊS REGRAS, e as três vieram de um problema concreto:
 *
 * 1. Quem escolheu 'dev' recebe as QUATRO. 'dev' é tanto a sobra do
 *    classificador quanto a opção "não sei ainda, quero ver de tudo". Sem
 *    isto, todo perfil salvo antes da divisão (a maioria da base tinha
 *    `Areas: ["dev"]`) passaria a receber ZERO vaga no dia do deploy.
 *
 * 2. Quem escolheu uma área específica TAMBÉM recebe 'dev'. O balde genérico
 *    tem "Desenvolvedor de Software" e "Tech Lead" dentro, que servem para
 *    qualquer um dos três. Mesmo raciocínio do 'other', que passa de
 *    propósito: perder vaga boa custa mais do que mostrar uma duvidosa.
 *
 * 3. MAS front e back NÃO se puxam. A primeira versão desta função expandia
 *    qualquer escolha da família para a família inteira, e o efeito foi que
 *    escolher "front-end" continuava trazendo vaga de back-end pura: o filtro
 *    não estreitava quase nada, que era exatamente a queixa que motivou
 *    dividir a área. 'fullstack' entra nos dois lados porque vaga full-stack
 *    pede front E back, então é relevante para os dois; o contrário não vale.
 *
 * @param {string[]} escolhidas
 * @returns {string[]} sem repetição
 */
const VIZINHAS = {
    dev: FAMILIA_DEV,                         // "quero ver de tudo"
    frontend: ['frontend', 'fullstack', 'dev'],
    backend: ['backend', 'fullstack', 'dev'],
    fullstack: ['fullstack', 'dev'],
};

export function expandirAreas(escolhidas) {
    const lista = Array.isArray(escolhidas) ? escolhidas.filter(Boolean).map(String) : [];
    if (!lista.length) return [];
    const fora = new Set(lista);
    for (const a of lista) {
        for (const v of (VIZINHAS[a] || [])) fora.add(v);
    }
    return [...fora];
}
