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

// Profissões que claramente NÃO são de tecnologia.
//
// O scraper lê posts de recrutador no LinkedIn, e recrutador anuncia de tudo:
// sem esta lista, o feed de um dev recebe "Assistente Operacional de Logística".
// Antes isso caía em 'other', e 'other' nunca era filtrado — a intenção original
// era não perder vaga boa mal classificada, mas o efeito era deixar passar todo
// o ruído.
//
// É testada DEPOIS de todas as áreas de tech, de propósito: assim um título
// híbrido como "Analista de Sistemas Comercial" fica com o lado técnico. Empatar
// a favor de tech é o erro barato — exibir uma vaga duvidosa incomoda, perder uma
// boa custa uma candidatura.
const NONTECH = new RegExp([
    // administrativo, financeiro e RH
    'analista (?:de )?(?:rh|recursos humanos|dp|departamento pessoal)', 'recursos humanos',
    'cont[áa]bil', '\\bfiscal\\b', 'tribut[áa]ri', 'auditoria', 'tesouraria', 'fp&a',
    'custos industriais', '\\bcontroller\\b', 'faturamento', 'cobran[çc]a',
    'analista administrativ', 'assistente administrativ', 'auxiliar administrativ',
    'secret[áa]ri', 'recep[çc]ionista', '\\bzelador',
    // compras, logística e operações
    'compras', 'suprimentos', 'licita[çc][õo]es', 'almoxarifad', 'log[íi]stic',
    'expedi[çc][ãa]o', 'estoquista', 'armaz[ée]m', 'motorista', 'entregador',
    'facilities', 'manuten[çc][ãa]o predial', 'operador de m[áa]quina',
    // comercial e marketing
    'vendedor', 'representante comercial', 'consultor de vendas', 'analista comercial',
    '\\bsdr\\b', 'pr[ée][- ]vendas', 'telemarketing', 'social media', 'publicidade',
    'marketing digital', 'analista de marketing', '\\bredator', 'jornalista',
    'videomaker', 'fot[óo]grafo', 'analista de eventos', 'customer success',
    // saúde, jurídico e educação
    'psic[óo]log', 'enfermeir', '\\bm[ée]dic[oa]\\b', 'nutricionista', 'fisioterap',
    'dentista', 'farmac[êe]utic', 'jur[íi]dic', 'advogad', 'paralegal',
    'professor', 'docente', 'pedagog', 'int[ée]rprete',
    // engenharias que não são de software
    'engenheir[oa]s? (?:civil|el[ée]tric|mec[âa]nic|de produ[çc][ãa]o|qu[íi]mic|ambiental)',
    'arquitet[oa] (?:e urbanista|de interiores)',
].join('|'));

// Classifica a ÁREA/cargo da vaga (dev, qa, po, data, design, devops, mobile,
// suporte) a partir do título + skills. A ORDEM importa: as áreas específicas são
// checadas antes do "dev" genérico (ex.: "Engenheiro de Qualidade" é QA, não Dev;
// um "engineer" que sobra cai em Dev), e o NONTECH vem por último, depois de
// esgotar tudo que é tech. 'other' = não deu pra classificar com confiança (não
// filtra, p/ não perder vaga boa).
export function detectArea(job) {
    const t = `${job.JobTitle || ''} ${parseArr(job.Skills).join(' ')}`.toLowerCase();
    // QA / Testes / Qualidade — inclui as variações em inglês e "engenheiro/analista
    // de qualidade", que senão escorregariam para "dev" por causa do "engineer".
    if (/\bqa\b|quality assurance|quality engineer|\bsdet\b|\btae\b|test(?:s)? engineer|test automation|automation test|\btester\b|analista\s+de\s+(?:testes?|qualidade)|engenheir[oa]s?\s+de\s+(?:testes?|qualidade)|automa[çc][ãa]o de testes?|testes? automatizad|qualidade de software/.test(t)) return 'qa';
    if (/product owner|product manager|\bpo\b|\bpm\b|gerente de produto|gest[ãa]o de produto|scrum master|agilista|agile (?:coach|master)/.test(t)) return 'po';
    if (/data engineer|engenheir[oa]s?\s+de\s+dados|cientista de dados|data scientist|data analyst|analista de dados|business intelligence|\bbi\b|analytics|machine learning|\bml\b|\bdba\b|database administrator|administrador[a]? de banco/.test(t)) return 'data';
    if (/\bux\b|\bui\b|designer|product design|ux\/ui|figma/.test(t)) return 'design';
    if (/devops|\bsre\b|site reliability|infraestrutura|cloud engineer|platform engineer|kubernetes|terraform/.test(t)) return 'devops';
    if (/\bios\b|android|flutter|react native|desenvolvedor[a]? mobile|mobile developer/.test(t)) return 'mobile';
    // Dev (genérico) — só depois das áreas específicas. "\bengineer\b" como último
    // recurso cobre "Senior/Staff Engineer" que antes caíam em 'other' e vazavam.
    // "tech lead", "arquiteto de software" e "analista de sistemas" entraram por
    // aparecerem como 'other' nos dados reais: vaga boa escapando da classificação.
    if (/desenvolvedor|developer|programador|engenheir[oa]s?\s+de\s+software|software engineer|\bengineer\b|full[\s-]?stack|back[\s-]?end|front[\s-]?end|\.net|\bjava\b|python|\bnode|react|angular|\bvue\b|svelte|\bphp\b|golang|kotlin|swift|\bruby\b|\brust\b|c\+\+|spring|django|laravel|\brails\b|tech lead|arquitet[oa] de software|software architect|analista de sistemas/.test(t)) return 'dev';
    // Suporte / Service Desk — carreira de TI legítima que caía inteira em 'other'.
    if (/service desk|help ?desk|suporte t[ée]cnico|analista de suporte|suporte n[123]\b|analista de ti\b|t[ée]cnico em inform[áa]tica|infraestrutura de ti/.test(t)) return 'suporte';
    // Nada de tech casou: só agora perguntamos se é outra profissão.
    if (NONTECH.test(t)) return 'nontech';
    return 'other';
}

export { parseArr };
