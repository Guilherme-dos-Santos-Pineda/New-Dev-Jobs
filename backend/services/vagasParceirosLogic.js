// =========================
// Vagas de parceiros: a regra (sem banco)
// =========================
// A recrutadora manda a vaga e um link de candidatura (Notion, Gupy, formulário).
// O admin cadastra; a vaga aparece em Vagas por link para quem tem o perfil. Sem
// email de propósito: vaga com email é a do feed, com envio pelo Gmail.

const EMAIL = /[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}/i;
const MODALIDADES = { remoto: 'Remoto', hibrido: 'Híbrido', presencial: 'Presencial' };
const limpa = (s, max) => String(s || '').replace(/\r/g, '').trim().slice(0, max);

/** Confere o que o admin digitou. Devolve { erro } ou { dados } já limpos. */
export function validarVagaParceiro(entrada = {}) {
    const titulo = limpa(entrada.titulo, 120).replace(/\n/g, ' ');
    const empresa = limpa(entrada.empresa, 80).replace(/\n/g, ' ');
    const local = limpa(entrada.local, 80).replace(/\n/g, ' ');
    const modalidade = MODALIDADES[entrada.modalidade] ? entrada.modalidade : '';
    const descricao = limpa(entrada.descricao, 6000);
    const link = limpa(entrada.link, 500);
    if (titulo.length < 5) return { erro: 'Escreva o cargo (ex.: Desenvolvedor Backend Pleno Python).' };
    if (!empresa) return { erro: 'Escreva a empresa.' };
    let url;
    try { url = new URL(link); } catch { return { erro: 'O link de candidatura não é um endereço válido.' }; }
    if (url.protocol !== 'https:') return { erro: 'O link de candidatura precisa começar com https://.' };
    // Com email no texto ela sairia da lista de vagas por link (e entregaria o contato).
    if ([titulo, empresa, local, descricao].some((s) => EMAIL.test(s))) return { erro: 'Tire o email do texto: a candidatura é pelo link.' };
    return { dados: { titulo, empresa, local, modalidade, descricao, link: url.href } };
}

/**
 * O texto guardado em "ScrapedPosts".Content: o título na primeira linha (é o que
 * tituloDoPost lê), o local no formato que vagaDoPost entende e a modalidade
 * escrita por extenso (é o que o classificador lê).
 */
export function conteudoDaVaga({ titulo, local, modalidade, descricao, link }) {
    return [
        titulo,
        local ? `📍 Local: ${local}` : null,
        modalidade ? `Modalidade: ${MODALIDADES[modalidade]}` : null,
        '',
        descricao || null,
        '',
        `Candidate-se pelo link: ${link}`,
    ].filter((l) => l !== null).join('\n').replace(/\n{3,}/g, '\n\n');
}
