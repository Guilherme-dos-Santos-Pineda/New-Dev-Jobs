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
// Prefixos de cargo que aparecem antes da área: "Assistente de RH", "Auxiliar
// Operacional", "Coordenador de Compras". Escrever a lista abaixo presa a
// "analista de X" deixava passar as variantes — e elas são a maioria.
const CARGO = '(?:analista|assistente|auxiliar|coordenador[a]?|supervisor[a]?|encarregad[oa]|gerente|estagi[áa]ri[oa]|jovem aprendiz|t[ée]cnic[oa])';

const NONTECH = new RegExp([
    // administrativo, financeiro e RH
    `${CARGO}s?\\s+(?:de\\s+)?(?:rh|recursos humanos|dp|departamento pessoal)`, 'recursos humanos',
    `${CARGO}s?\\s+operacional`, '\\bauxiliar operacional\\b',
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
    'marketing digital', `${CARGO}s?\\s+(?:de\\s+)?marketing`, '\\bredator', 'jornalista',
    'videomaker', 'fot[óo]grafo', `${CARGO}s?\\s+(?:de\\s+)?eventos`, 'customer success',
    // saúde, jurídico e educação
    'psic[óo]log', 'enfermeir', '\\bm[ée]dic[oa]\\b', 'nutricionista', 'fisioterap',
    'dentista', 'farmac[êe]utic', 'jur[íi]dic', 'advogad', 'paralegal',
    'professor', 'docente', 'pedagog', 'int[ée]rprete',
    // engenharias que não são de software
    'engenheir[oa]s? (?:civil|el[ée]tric|mec[âa]nic|de produ[çc][ãa]o|qu[íi]mic|ambiental)',
    'arquitet[oa] (?:e urbanista|de interiores)',
].join('|'));

// Área de tech a partir de um texto. A ORDEM importa: as áreas específicas vêm
// antes do "dev" genérico (ex.: "Engenheiro de Qualidade" é QA, não Dev; um
// "engineer" que sobra cai em Dev). Devolve null quando nada casa.
function areaTech(t) {
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
    // "de TI" aceita qualquer prefixo de cargo: assistente e auxiliar de TI são
    // tão comuns quanto analista, e escreviam-se só como 'other'.
    if (/service desk|help ?desk|suporte t[ée]cnico|analista de suporte|suporte n[123]\b|(?:analista|assistente|auxiliar|t[ée]cnic[oa])s?\s+(?:de\s+)?ti\b|t[ée]cnic[oa] em inform[áa]tica|infraestrutura de ti/.test(t)) return 'suporte';
    return null;
}

/**
 * Classifica a ÁREA/cargo da vaga. O TÍTULO manda; as skills só decidem quando o
 * título não diz nada.
 *
 * POR QUE ESSA HIERARQUIA: a extração de skills erra feio em vaga que não é de
 * tech. Casos reais da base — "Assistente Operacional" (logística) com
 * `[".NET"]`, "Assistente de RH" com `["Go"]`, "Consultor Comercial" com
 * `["REST","Go"]`. Antes o texto era `título + skills` com peso igual, então UMA
 * skill inventada sequestrava a classificação e a vaga de logística virava 'dev'.
 *
 * Ordem: (1) título casa com tech → é tech; (2) título casa com outra profissão →
 * nontech, e skill nenhuma salva; (3) título vago ("Vaga", "Oportunidade") → aí
 * sim as skills decidem; (4) 'other'.
 */
export function detectArea(job) {
    const titulo = String(job.JobTitle || '').toLowerCase();

    // 1. O título é o sinal confiável.
    const porTitulo = areaTech(titulo);
    if (porTitulo) return porTitulo;

    // 2. Título de outra profissão: skill alucinada não reverte.
    if (NONTECH.test(titulo)) return 'nontech';

    // 3. Título sem informação ("Vaga", "Estamos contratando"): as skills são o
    //    único sinal que resta, então valem — com o risco assumido de errar aqui.
    const comSkills = `${titulo} ${parseArr(job.Skills).join(' ')}`.toLowerCase();
    return areaTech(comSkills) || 'other';
}

/**
 * Normaliza a modalidade da vaga para 'remoto' | 'hibrido' | 'presencial'.
 *
 * A coluna "Modality" vem da extração e chega suja: "remoto", "remote",
 * "híbrido", "hibrido", "remoto, hibrido", "PJ" (que nem é modalidade). Além
 * disso, 54% das vagas não têm o campo — por isso caímos no texto do anúncio,
 * onde "100% remoto" e "home office" aparecem o tempo todo.
 *
 * Devolve null quando não dá para afirmar. Quem chama decide o que fazer com a
 * dúvida; aqui não inventamos.
 */
export function detectModality(job) {
    const campo = String(job.Modality || '').toLowerCase();
    const texto = `${job.JobTitle || ''} ${job.Location || ''} ${job.Description || ''}`.toLowerCase();

    // O campo, quando existe, é o sinal mais forte. Valor múltiplo ("remoto,
    // hibrido") conta como as duas coisas — quem filtra por remoto deve ver.
    const doCampo = new Set();
    if (/remot|home ?office|anywhere/.test(campo)) doCampo.add('remoto');
    if (/h[íi]brid|hybrid/.test(campo)) doCampo.add('hibrido');
    if (/presencial|on ?site|no local/.test(campo)) doCampo.add('presencial');
    if (doCampo.size) return [...doCampo];

    // Sem campo: o texto do anúncio. Híbrido antes de remoto, senão "híbrido com
    // 2 dias remotos" seria lido como remoto puro.
    if (/h[íi]brid|hybrid/.test(texto)) return ['hibrido'];
    if (/100% remoto|totalmente remoto|home ?office|trabalho remoto|fully remote|remote[- ]first|\bremoto\b|\bremote\b/.test(texto)) return ['remoto'];
    if (/presencial|no local da empresa|on[- ]site/.test(texto)) return ['presencial'];
    return null;
}

export { parseArr };

// =========================
// Classificação PERSISTIDA (colunas derivadas de "Jobs")
// =========================
// Antes, cada requisição de cada usuário reclassificava a base inteira em JS:
// `select * from "Jobs"` (1,5 kB por linha) → filtro em memória. Com 6 mil vagas
// isso já custava ~12 MB e ~1,2 s POR USUÁRIO; com 50 mil vagas e mil usuários a
// conta não fecha em VM nenhuma — muito menos na de 954 MB.
//
// A classificação depende só da vaga, nunca do usuário. Então é calculada UMA vez
// (na inserção) e gravada em "Area"/"Level"/"Mods"/"IsBR", com índice. O filtro
// vira SQL: o banco devolve as dezenas de vagas que interessam em vez de as
// dezenas de milhares que não.
//
// CLASSIFY_VERSION existe porque as regras MUDAM (e vão mudar). Toda linha guarda
// a versão com que foi classificada; `npm run reclassify` reprocessa só as
// defasadas. Sem isso, ajustar o classificador exigiria lembrar de varrer a tabela
// à mão — e o esquecimento seria silencioso: a vaga velha ficaria com a regra
// velha para sempre.
export const CLASSIFY_VERSION = 1;

const BR_HINT = /brasil|brazil|s[ãa]o paulo|rio de janeiro|belo horizonte|curitiba|porto alegre|bras[íi]lia|fortaleza|recife|salvador|campinas|florian[óo]polis/i;

/** Heurística de país da vaga (mesma lógica do scraper). */
export function jobIsBR(job) {
    const dom = (job.Email || '').split('@')[1]?.toLowerCase() || '';
    if (dom.endsWith('.br')) return true;
    const text = `${job.Location || ''} ${job.JobTitle || ''} ${job.Description || ''}`;
    if (BR_HINT.test(text)) return true;
    return /[ãõçáéíóúâê]/i.test(job.Description || '') && /\b(vaga|currículo|contratando|desenvolvedor)\b/i.test(text);
}

/**
 * Tudo o que dá para saber da vaga sem conhecer o usuário. É o que vai para as
 * colunas derivadas — e o que o SQL passa a filtrar.
 */
export function classifyJob(job) {
    return {
        area: detectArea(job),
        level: detectLevel(`${job.JobTitle || ''} ${job.Description || ''}`),
        mods: detectModality(job), // array ou null ("não dá para afirmar")
        isBR: jobIsBR(job),
        version: CLASSIFY_VERSION,
    };
}
