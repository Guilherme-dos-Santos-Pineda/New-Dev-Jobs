// Lógica pura do leitor de vagas do GitHub (sem rede e sem banco), testável.
//
// Comunidades brasileiras publicam vaga como issue em repositórios "vagas".
// Medido em 12/11/2026: 67 vagas em 30 dias nos repositórios ativos, 18 com
// email. É pouco perto do LinkedIn, mas é fonte nossa: API pública, sem conta,
// sem crédito da Apify e permitida pelos termos do GitHub.

// Só os repositórios que tiveram vaga em outubro/novembro de 2026. Os outros
// (vuejs-br, Gommunity, flutterbr, uxbrasil, datascience-br...) estão parados.
export const REPOS_DE_VAGAS = [
    'backend-br/vagas',
    'frontendbr/vagas',
    'react-brasil/vagas',
    'soujava/vagas-java',
    'phpdevbr/vagas',
    'CocoaHeadsBrasil/vagas',
    'androiddevbr/vagas',
    'qa-brasil/vagas',
];

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// O perfil do LinkedIn de quem postou, se o texto trouxer UM só. Com dois ou
// mais não dá para saber qual é o recrutador (pode ser o do gestor, o de um
// colega), e recrutador errado gasta crédito no monitoramento à toa.
// Página de empresa (/company/) não serve: o monitoramento busca por pessoa.
export function linkedinDoAutor(texto) {
    const achados = new Set();
    for (const m of String(texto || '').matchAll(/https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%]+)/gi)) {
        achados.add(m[1].toLowerCase());
    }
    if (achados.size !== 1) return null;
    return `https://www.linkedin.com/in/${[...achados][0]}`;
}

// O email serve para RECEBER currículo? Os modelos de issue têm a seção
// "Como se candidatar": se ela existe, o email tem de estar nela. Medido em
// 12/11/2026: 12 das 15 issues com email eram de uma agência que pede a
// candidatura pela página dela e põe o email só em "Contato para retorno".
// Mandar currículo para lá é spam para o recrutador, e a reputação que cai é a
// do Gmail de quem envia. Sem a seção (texto livre), vale o email do texto.
export function emailParaCandidatura(corpo) {
    const texto = String(corpo || '');
    const secao = texto.match(/^#{1,6}\s*\**\s*como se candidatar[^\n]*\n([\s\S]*?)(?=^#{1,6}\s|$(?![\s\S]))/im);
    const onde = secao ? secao[1] : texto;
    return EMAIL_RE.test(onde);
}

// Issue do GitHub → item no formato que processarPosts (scraper.js) espera.
// Devolve null para o que não vira vaga: pull request, issue sem email para
// candidatura (sem ele não há envio, e o post iria parar em Vagas por link) e
// issue fechada (a vaga foi preenchida).
export function issueParaPost(issue, repo) {
    if (!issue || issue.pull_request || issue.state !== 'open') return null;
    const corpo = String(issue.body || '');
    if (!emailParaCandidatura(corpo)) return null;
    // Título na primeira linha: é ele que a IA e o classificador leem primeiro.
    const content = `${issue.title || ''}\n\n${corpo}`.trim();
    return {
        id: `github:${repo}#${issue.number}`,
        content,
        author: { name: issue.user?.login || null, linkedinUrl: linkedinDoAutor(corpo) || '' },
        linkedinUrl: issue.html_url || null,
        postedAt: { date: issue.created_at },
    };
}
