// =========================
// Um robô por pagante: a regra PURA (sem SQL nem Apify), testável
// =========================
// Pedido do dono (12/11/2026): "um robô por pessoa com base no perfil, porque
// hoje já tem gente pagando sem vaga". Medido em 11/11/2026: com até 50 envios por
// dia, o estoque de um pagante júnior acabava em 4 a 9 dias.
//
// O que rende: a busca com "currículo para" (11/11/2026: 429 posts, 175 vagas
// novas por US$ 0,86, 41% dos posts com email, contra 3 a 14% das outras). Por
// isso cada pessoa tem as SUAS buscas nesse formato, com a área e o nível dela.
//
// Janela: a primeira vez (ou depois de 25 dias) olha o último MÊS, que é onde está
// o volume; depois, a cada RODAR_A_CADA_DIAS, olha a última semana. Rodar todo dia
// com janela de semana recompraria os mesmos posts.

export const RODAR_A_CADA_DIAS = 6;
export const PROFUNDA_A_CADA_DIAS = 25;
export const CONSULTAS_POR_PESSOA = 8;
export const POSTS_POR_CONSULTA = 30;
export const PESSOAS_POR_DIA = 6;
const DIA_MS = 86400000;

const TERMO = {
    frontend: 'front-end', backend: 'back-end', fullstack: 'full stack', dev: 'desenvolvedor',
    mobile: 'mobile', data: 'dados', devops: 'infraestrutura', qa: 'QA', design: 'UX',
    po: 'product owner', erp: 'SAP', suporte: 'suporte TI',
    adm: 'administrativo', financeiro: 'financeiro', rh: 'RH', engenharia: 'engenharia',
    vendas: 'vendas', marketing: 'marketing', operacoes: 'logística', juridico: 'jurídico',
};
const NIVEL = { estagio: 'estágio', junior: 'júnior', pleno: 'pleno', senior: 'sênior' };
const ORDEM = ['estagio', 'junior', 'pleno', 'senior', 'lead', 'manager'];

const lista = (v) => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};

/**
 * As buscas da pessoa, da mais importante para a menos: para cada área (até 3) no
 * nível mais baixo dela (é onde falta vaga), "currículo para" e "enviar currículo".
 */
export function consultasPessoais(perfil, max = CONSULTAS_POR_PESSOA) {
    const niveis = lista(perfil?.Levels).map((n) => String(n).toLowerCase());
    const nivel = NIVEL[ORDEM.find((n) => niveis.includes(n))] || '';
    const areas = [...new Set(lista(perfil?.Areas))].filter((a) => TERMO[a]).slice(0, 3);
    // Sem área: o "desenvolvedor" genérico, que é o que a maioria procura.
    const termos = areas.length ? areas.map((a) => TERMO[a]) : ['desenvolvedor'];
    const n = nivel ? `"${nivel}" ` : '';
    const porTermo = termos.map((t) => [`${n}${t} "currículo para"`, `${n}${t} "enviar currículo"`, `vaga ${nivel ? `${nivel} ` : ''}${t} currículo`]);
    // Intercala: a primeira busca de cada área antes da segunda de qualquer uma.
    const todas = [];
    for (let i = 0; i < 3; i += 1) for (const c of porTermo) if (c[i] && !todas.includes(c[i])) todas.push(c[i]);
    return todas.slice(0, max);
}

/**
 * Se é dia de rodar e com que janela. `ultima` e `ultimaProfunda` são datas (ou
 * null). `forcar` (o botão "Rodar agora" do admin) ignora o intervalo.
 */
export function proximaBusca({ ultima = null, ultimaProfunda = null, forcar = false } = {}, agora = Date.now()) {
    const ms = (d) => (d ? new Date(d).getTime() : null);
    const desdeUltima = ms(ultima) == null ? Infinity : (agora - ms(ultima)) / DIA_MS;
    const desdeProfunda = ms(ultimaProfunda) == null ? Infinity : (agora - ms(ultimaProfunda)) / DIA_MS;
    const janela = desdeProfunda >= PROFUNDA_A_CADA_DIAS ? 'month' : 'week';
    const rodar = forcar || desdeUltima >= RODAR_A_CADA_DIAS;
    const proxima = ms(ultima) == null ? agora : ms(ultima) + RODAR_A_CADA_DIAS * DIA_MS;
    return { rodar, janela, proxima };
}

/** Para quantos dias de envio dá o estoque, no ritmo de envio da pessoa. */
export function diasDeEstoque(estoque, enviosPorDia) {
    if (!estoque) return 0;
    if (!enviosPorDia || enviosPorDia <= 0) return null; // não envia: o estoque não acaba
    return Math.floor(estoque / enviosPorDia);
}

/** Quem é atendido primeiro: quem tem menos dias de vaga. Quem não envia vai por último. */
export function ordemDeAtendimento(pessoas) {
    const chave = (p) => (p.dias == null ? Infinity : p.dias);
    return [...pessoas].sort((a, b) => chave(a) - chave(b));
}
