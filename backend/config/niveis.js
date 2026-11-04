// =========================
// Quais níveis de vaga entram no feed de uma pessoa
// =========================
// Até 02/11/2026 o nível só filtrava com "Senioridade estrita" ligada, que
// ninguém liga (estava enterrada em Filtros avançados, e o assistente nem
// grava). Um estagiário que escolheu "estágio + júnior" recebia 584 vagas
// sênior e 244 pleno, várias com 100% de match, e mandou um currículo só.
//
// Agora o nível escolhido SEMPRE filtra, com folga de um degrau para cada lado
// (júnior vê estágio, júnior e pleno; nunca sênior). "Senioridade estrita"
// tira a folga. Vaga sem nível declarado continua passando.
//
// Usada pelo corte barato (candidatasDoPerfil), por passesFilters e pelo
// diagnóstico do admin. Uma função só, senão os filtros divergem.

export const ORDEM_NIVEIS = ['estagio', 'junior', 'pleno', 'senior', 'lead', 'manager'];

const parse = (v) => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};

/** Níveis aceitos para o perfil, ou [] quando não há filtro de nível. */
export function niveisAceitos(profile) {
    const escolhidos = parse(profile?.Levels).map((l) => String(l).toLowerCase()).filter((l) => ORDEM_NIVEIS.includes(l));
    if (!escolhidos.length) return [];
    if (profile?.StrictLevel) return escolhidos;
    const aceitos = new Set();
    for (const l of escolhidos) {
        const i = ORDEM_NIVEIS.indexOf(l);
        for (const j of [i - 1, i, i + 1]) if (ORDEM_NIVEIS[j]) aceitos.add(ORDEM_NIVEIS[j]);
    }
    return ORDEM_NIVEIS.filter((l) => aceitos.has(l));
}
