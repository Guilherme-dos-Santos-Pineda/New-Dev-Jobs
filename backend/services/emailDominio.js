import dns from 'node:dns/promises';

// =========================
// O domínio do email da vaga existe?
// =========================
// Relato no grupo (09/11/2026): ~7 de cada 100 envios voltam como "endereço não
// existe". A permissão do Gmail é só de enviar, então o bounce cai na caixa da
// pessoa e a gente nunca vê. O que dá para saber ANTES de enviar é se o domínio
// recebe email: medido no mesmo dia, 17 de 774 domínios das vagas recentes não
// existem (`.com.b`, `flarcinsulting.com.br`), 0,8% das vagas. Caixa que não existe
// num domínio válido continua sem como saber daqui.
//
// Só barra o que o DNS diz com certeza que não existe. Falha de rede ou timeout
// conta como "existe": barrar por dúvida mataria vaga boa.

const VALIDADE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();
const NAO_EXISTE = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

async function temRegistro(resolver, dominio) {
    try {
        const r = await resolver(dominio);
        return r.length > 0 ? true : false;
    } catch (e) {
        return NAO_EXISTE.has(e.code) ? false : null;
    }
}

/** true se o domínio pode receber email (MX, ou A/AAAA na falta dele), ou se não deu para saber. */
export async function dominioRecebeEmail(dominio, consultar = dns) {
    const d = String(dominio || '').toLowerCase().trim();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return false;
    const guardado = cache.get(d);
    if (guardado && Date.now() - guardado.em < VALIDADE_MS) return guardado.ok;

    let ok = true;
    const mx = await temRegistro(consultar.resolveMx.bind(consultar), d);
    if (mx === false) {
        const a = await temRegistro(consultar.resolve4.bind(consultar), d);
        const aaaa = a ? true : await temRegistro(consultar.resolve6.bind(consultar), d);
        ok = !(a === false && aaaa === false);
    }
    cache.set(d, { ok, em: Date.now() });
    if (cache.size > 5000) cache.delete(cache.keys().next().value);
    return ok;
}

/** Os endereços cujo domínio não existe. Vazio: pode enviar. */
export async function enderecosSemDominio(enderecos, consultar = dns) {
    const ruins = [];
    for (const e of enderecos) {
        if (!(await dominioRecebeEmail(String(e).split('@')[1], consultar))) ruins.push(e);
    }
    return ruins;
}
