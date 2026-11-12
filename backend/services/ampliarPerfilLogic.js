// =========================
// "Seu perfil tem pouca vaga": o que abrir no perfil, e quanto rende (regra pura)
// =========================
// Pedido do dono (12/11/2026): aviso automático para quem tem pouca vaga. Medido no
// mesmo dia: o robô de cada pagante achou quase só vaga repetida para júnior e
// estágio de TI (em 7 dias entraram 2 vagas de dev júnior com email no Brasil). O
// que mais aumenta o feed dessas pessoas é ABRIR o perfil: nível vizinho, área
// vizinha, aceitar híbrido, vagas mais antigas. Cada sugestão vem com o número de
// vagas que ela traz, medido no feed real da pessoa (ampliarPerfil.js).

const ORDEM = ['estagio', 'junior', 'pleno', 'senior', 'lead', 'manager'];
const NOME_NIVEL = { estagio: 'estágio', junior: 'júnior', pleno: 'pleno', senior: 'sênior', lead: 'liderança', manager: 'gerência' };

// Área → vizinhas que a mesma pessoa costuma aceitar.
const VIZINHAS = {
    frontend: ['fullstack', 'mobile'], backend: ['fullstack', 'data'], fullstack: ['frontend', 'backend'],
    dev: ['qa', 'suporte'], mobile: ['frontend', 'fullstack'], data: ['backend', 'erp'],
    devops: ['suporte', 'backend'], qa: ['suporte', 'dev'], design: ['frontend', 'po'], po: ['qa', 'data'],
    suporte: ['devops', 'qa'], erp: ['suporte', 'data'],
    adm: ['financeiro', 'rh'], financeiro: ['adm', 'rh'], rh: ['adm', 'financeiro'], vendas: ['marketing', 'adm'],
    marketing: ['vendas', 'adm'], operacoes: ['adm', 'engenharia'], engenharia: ['operacoes'], juridico: ['adm'],
};
const NOME_AREA = {
    frontend: 'front-end', backend: 'back-end', fullstack: 'full stack', dev: 'desenvolvimento (geral)', mobile: 'mobile',
    data: 'dados', devops: 'DevOps/infra', qa: 'QA', design: 'design', po: 'produto', suporte: 'suporte', erp: 'ERP/SAP',
    adm: 'administrativo', financeiro: 'financeiro', rh: 'RH', vendas: 'vendas', marketing: 'marketing',
    operacoes: 'operações', engenharia: 'engenharia', juridico: 'jurídico',
};

const lista = (v) => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};
const e = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} e ${xs.at(-1)}` : xs[0] || '');

/** Pouca vaga = não dá para uma semana no ritmo do plano. */
export function temPoucaVaga(total, limiteDoDia) {
    return total < Math.max(30, (Number(limiteDoDia) || 20) * 7);
}

/** As mudanças possíveis no perfil, cada uma com o `patch` (colunas de "Profiles"). */
export function variantesDoPerfil(perfil) {
    const out = [];
    const niveis = lista(perfil?.Levels);
    if (niveis.length) {
        const idx = niveis.map((n) => ORDEM.indexOf(n)).filter((i) => i >= 0);
        const vizinhos = [Math.min(...idx) - 1, Math.max(...idx) + 1]
            .filter((i) => i >= 0 && i < 4) // até sênior: liderança e gerência são outro público
            .map((i) => ORDEM[i]).filter((n) => !niveis.includes(n));
        if (vizinhos.length) out.push({ id: 'niveis', texto: `Marcar também ${e(vizinhos.map((n) => NOME_NIVEL[n]))}`, patch: { Levels: [...niveis, ...vizinhos] } });
    }
    const areas = lista(perfil?.Areas);
    if (areas.length) {
        const novas = [...new Set(areas.flatMap((a) => VIZINHAS[a] || []))].filter((a) => !areas.includes(a)).slice(0, 2);
        if (novas.length) out.push({ id: 'areas', texto: `Marcar também ${e(novas.map((a) => NOME_AREA[a] || a))}`, patch: { Areas: [...areas, ...novas] } });
    }
    const mods = lista(perfil?.Modalities);
    if (mods.length && !mods.includes('hibrido')) {
        out.push({ id: 'hibrido', texto: 'Aceitar vaga híbrida também', patch: { Modalities: [...mods, 'hibrido'] } });
    }
    if (Number(perfil?.PostingDays) > 0) {
        out.push({ id: 'antigas', texto: 'Incluir vagas mais antigas', patch: { PostingDays: 0 } });
    }
    if (perfil?.Region === 'br') {
        out.push({ id: 'exterior', texto: 'Incluir vagas do exterior', patch: { Region: 'ambos' } });
    }
    return out;
}

/** As que valem a pena: rendem pelo menos 5 vagas, da que mais rende para a que menos. */
export function melhoresSugestoes(medidas, max = 3) {
    return medidas.filter((m) => m.ganho >= 5).sort((a, b) => b.ganho - a.ganho).slice(0, max);
}
