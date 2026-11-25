// =========================
// Segurança contra raspagem: a regra (sem banco)
// =========================
// Medo do dono (25/11/2026): gente criando conta para copiar as vagas e os emails
// dos recrutadores. O que já existia: o feed e o detalhe nunca devolvem email; o
// "enviar você mesmo" revela um por clique, só de vaga do feed, gastando a cota.
// O que faltava (medido no mesmo dia):
//   - GET /jobs/:id devolvia QUALQUER vaga da base pelo número: dava para percorrer
//     de 1 a 30 mil e copiar título, empresa e descrição de tudo;
//   - os limites eram só por IP (600 a cada 15 min), não por conta;
//   - várias contas no mesmo IP somavam 20 emails revelados por dia CADA.

/** Tetos. Uso real medido: ninguém passa de ~60 detalhes nem de 25 "enviar você mesmo" por dia. */
export const TETOS = {
    detalhePorDia: 300,     // GET /jobs/:id por conta
    revelarPorIpDia: 40,    // "enviar você mesmo" somando todas as contas de um IP
};

// Domínios de email temporário: conta feita para jogar fora. Lista curta dos que
// aparecem em fórum; não precisa ser completa, precisa tornar a farra mais cara.
const DESCARTAVEIS = new Set([
    'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', '10minutemail.com',
    '10minutemail.net', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempail.com', 'yopmail.com', 'yopmail.net',
    'trashmail.com', 'getnada.com', 'nada.email', 'dispostable.com', 'maildrop.cc', 'mintemail.com', 'throwawaymail.com',
    'fakeinbox.com', 'mohmal.com', 'emailondeck.com', 'tempr.email', 'discard.email', 'moakt.com', 'mail.tm',
    'tmpmail.org', 'tmpmail.net', 'burnermail.io', 'spamgourmet.com', 'mailnesia.com', 'mytemp.email', 'tempmailo.com',
    'emailfake.com', 'inboxkitten.com', 'byom.de', 'trash-mail.com', 'wegwerfmail.de', 'cock.li', 'tuta.io',
]);

/** O email é de serviço temporário? Subdomínio conta (x.mailinator.com). */
export function emailDescartavel(email) {
    const dominio = String(email || '').toLowerCase().trim().split('@')[1] || '';
    if (!dominio) return false;
    const partes = dominio.split('.');
    for (let i = 0; i < partes.length - 1; i++) {
        if (DESCARTAVEIS.has(partes.slice(i).join('.'))) return true;
    }
    return false;
}

/**
 * A pessoa pode ler o detalhe desta vaga? Só a que ela vê (feed), a que já
 * enviou (Enviadas) ou a dos destaques do dia. Ids como string: bigint do postgres.js.
 */
export function podeVerVaga(jobId, { noFeed = [], enviadas = [], destaques = [] }) {
    const id = String(jobId);
    return [noFeed, enviadas, destaques].some((lista) => lista.some((x) => String(x) === id));
}

/**
 * Contador por chave e por dia (UTC), em memória: o processo é um só. Devolve
 * { n, passou, primeiraVez } para quem chama decidir e alertar uma vez só.
 */
export function criarContador(teto) {
    const mapa = new Map();
    let dia = '';
    return function contar(chave, agora = new Date()) {
        const hoje = agora.toISOString().slice(0, 10);
        if (hoje !== dia) { mapa.clear(); dia = hoje; }
        const n = (mapa.get(chave) || 0) + 1;
        mapa.set(chave, n);
        return { n, passou: n > teto, primeiraVez: n === teto + 1 };
    };
}
