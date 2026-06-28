// =========================================================================
// Classificação de vaga: ÁREA profissional e SENIORIDADE, a partir do
// título + skills. Módulo isolado (sem dependências de outros serviços) para
// ser usado tanto pelo filtro (jobsQuery) quanto pelo motor de match (matching)
// sem criar import circular.
// =========================================================================

const parseArr = (v) => (Array.isArray(v) ? v : (() => { try { const a = JSON.parse(v); return Array.isArray(a) ? a : []; } catch { return []; } })());

export function detectLevel(text = '') {
    const t = text.toLowerCase();
    if (/gerente|manager|head\b/.test(t)) return 'manager';
    if (/tech lead|\blead\b|l[íi]der t[ée]cnico|staff|principal/.test(t)) return 'lead';
    if (/especialista|specialist/.test(t)) return 'senior';
    if (/s[êe]nior|senior|\bsr\b/.test(t)) return 'senior';
    if (/pleno|\bpl\b|mid[-\s]?level/.test(t)) return 'pleno';
    if (/j[úu]nior|junior|\bjr\b|entry/.test(t)) return 'junior';
    if (/est[áa]gi|intern|trainee/.test(t)) return 'estagio';
    return null;
}

// Classifica a ÁREA/cargo da vaga (dev, qa, po, data, design, devops, mobile) a
// partir do título + skills. A ORDEM importa: as áreas específicas são checadas
// antes do "dev" genérico (ex.: "Engenheiro de Qualidade" é QA, não Dev; um
// "engineer" que sobra cai em Dev). 'other' = não deu pra classificar com
// confiança (não filtra, p/ não perder vaga boa).
export function detectArea(job) {
    const t = `${job.JobTitle || ''} ${parseArr(job.Skills).join(' ')}`.toLowerCase();
    // QA / Testes / Qualidade — inclui as variações em inglês e "engenheiro/analista
    // de qualidade", que senão escorregariam para "dev" por causa do "engineer".
    if (/\bqa\b|quality assurance|quality engineer|\bsdet\b|\btae\b|test(?:s)? engineer|test automation|automation test|\btester\b|analista\s+de\s+(?:testes?|qualidade)|engenheir[oa]s?\s+de\s+(?:testes?|qualidade)|automa[çc][ãa]o de testes?|testes? automatizad|qualidade de software/.test(t)) return 'qa';
    if (/product owner|product manager|\bpo\b|\bpm\b|gerente de produto|gest[ãa]o de produto|scrum master|agilista/.test(t)) return 'po';
    if (/data engineer|engenheir[oa]s?\s+de\s+dados|cientista de dados|data scientist|data analyst|analista de dados|business intelligence|\bbi\b|analytics|machine learning|\bml\b/.test(t)) return 'data';
    if (/\bux\b|\bui\b|designer|product design|ux\/ui|figma/.test(t)) return 'design';
    if (/devops|\bsre\b|site reliability|infraestrutura|cloud engineer|platform engineer|kubernetes|terraform/.test(t)) return 'devops';
    if (/\bios\b|android|flutter|react native|desenvolvedor[a]? mobile|mobile developer/.test(t)) return 'mobile';
    // Dev (genérico) — só depois das áreas específicas. "\bengineer\b" como último
    // recurso cobre "Senior/Staff Engineer" que antes caíam em 'other' e vazavam.
    if (/desenvolvedor|developer|programador|engenheir[oa]s?\s+de\s+software|software engineer|\bengineer\b|full[\s-]?stack|back[\s-]?end|front[\s-]?end|\.net|\bjava\b|python|\bnode|react|angular|\bvue\b|svelte|\bphp\b|golang|kotlin|swift|\bruby\b|\brust\b|c\+\+|spring|django|laravel|\brails\b/.test(t)) return 'dev';
    return 'other';
}

export { parseArr };
