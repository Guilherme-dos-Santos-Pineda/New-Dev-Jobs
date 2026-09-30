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
 * DUAS REGRAS, e as duas existem por um motivo concreto:
 *
 * 1. Quem escolheu 'dev' recebe as QUATRO. Sem isto, todo perfil salvo antes
 *    desta mudança (a maioria da base: `Areas: ["dev"]`) passaria a receber
 *    ZERO vaga no dia do deploy, porque as vagas viraram frontend/backend/
 *    fullstack e nenhuma seria mais 'dev'. Quebrar todo mundo para arrumar uma
 *    categoria seria um preço absurdo, e silencioso.
 *
 * 2. Quem escolheu 'frontend' (ou back, ou full) TAMBÉM recebe 'dev'. O balde
 *    genérico tem "Desenvolvedor de Software" e "Tech Lead" dentro, que
 *    servem para os três. É o mesmo raciocínio do 'other', que passa de
 *    propósito: título ruim não quer dizer vaga ruim, e perder vaga boa custa
 *    mais do que mostrar uma duvidosa.
 *
 * @param {string[]} escolhidas
 * @returns {string[]} sem repetição
 */
export function expandirAreas(escolhidas) {
    const lista = Array.isArray(escolhidas) ? escolhidas.filter(Boolean).map(String) : [];
    if (!lista.length) return [];
    const fora = new Set(lista);
    if (lista.some((a) => FAMILIA_DEV.includes(a))) {
        for (const a of FAMILIA_DEV) fora.add(a);
    }
    return [...fora];
}
