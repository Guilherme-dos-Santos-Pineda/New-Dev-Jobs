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
    // vistos no primeiro run do monitoramento novo (12/10/2026): todos caíam em
    // 'other' e passavam no feed de dev
    'exporta[çc][ãa]o', 'importa[çc][ãa]o', 'transporte', '\\baprendiz\\b',
    // comercial e marketing
    'vendedor', 'representante comercial', 'consultor de vendas', 'analista comercial',
    '\\bsdr\\b', '\\bbdr\\b', 'business development', 'captador','pr[ée][- ]vendas', 'telemarketing', 'social media', 'publicidade',
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
    if (/\bqa\b|quality assurance|quality engineer|\bsdet\b|\btae\b|test(?:s)? engineer|test automation|automation test|\btester\b|analista\s+de\s+(?:testes?|qualidade)|engenheir[oa]s?\s+de\s+(?:testes?|qualidade)|automa[çc][ãa]o de testes?|testes? automatizad|qualidade de software|gerente de testes|\btesting\b|automatizador de testes|quality analyst/.test(t)) return 'qa';
    // Produto inclui PROJETOS de TI (PM, PMO, analista funcional/de negócios).
    if (/product owner|product manager|\bpo\b|\bpm\b|gerente de produto|gest[ãa]o de produto|scrum master|agilista|agile (?:coach|master)|project manager|program manager|gerente de projetos?|gerente de programas?|\bpmo\b|analista de projetos|coordenador[a]? de projetos|business analyst|analista de neg[óo]cios|analista funcional|product analyst/.test(t)) return 'po';
    if (/data engineer|engenheir[oa]s?\s+(?:de\s+)?dados|eng\.? (?:de )?dados|mlops|cientista de dados|data scientist|data analyst|analista de dados|business intelligence|\bbi\b|analytics|machine learning|\bml\b|\bdba\b|database administrator|administrador[a]? de banco|banco de dados|data architect|data science|databricks|snowflake|power bi|microsoft fabric|governan[çc]a de dados|(?:especialista|consultor[a]?|arquitet[oa]|l[íi]der t[ée]cnic[oa]) (?:\w+ )?(?:em|de) dados/.test(t)) return 'data';
    if (/\bux\b|\bui\b|designer|product design|ux\/ui|figma/.test(t)) return 'design';
    // Infra inclui redes e segurança da informação: eram 'other'.
    if (/devops|\bsre\b|site reliability|infraestrutura|cloud engineer|platform engineer|kubernetes|terraform|redes(?! sociais)|\bnetwork|administrador de sistemas|sysadmin|seguran[çc]a (?:da informa|cibern|de redes|ofensiva|defensiva|\/redes)|ciberseg|cyber|security|pentest|devsecops|blue team|red team|infoblox|vulnerab|finops|gest[ãa]o de acessos|\biam\b|servidores|windows server|server administrator|infraestructura|engenheir[oa] de plataforma|openshift|open shift|red hat|\bnube\b/.test(t)) return 'devops';
    if (/\bios\b|android|flutter|react native|desenvolvedor[a]? mobile|mobile developer/.test(t)) return 'mobile';
    // Dev (genérico) — só depois das áreas específicas. "\bengineer\b" como último
    // recurso cobre "Senior/Staff Engineer" que antes caíam em 'other' e vazavam.
    // "tech lead", "arquiteto de software" e "analista de sistemas" entraram por
    // aparecerem como 'other' nos dados reais: vaga boa escapando da classificação.
    // --- Desenvolvimento, agora dividido em tres ---
    //
    // Antes era um balde so ('dev'): 4714 das 7826 vagas com email. Um dev de
    // front recebia vaga de back, de dados, de tudo, e a queixa real foi "acho
    // pouquissima vaga de front-end" — nao era filtro mal configurado, e que a
    // categoria nao existia.
    //
    // A ORDEM aqui e o que faz funcionar:
    //   1. fullstack primeiro, senao "Full Stack (React/Node)" vira front no
    //      primeiro termo que casar;
    //   2. front e back pelas TECNOLOGIAS, que e como o recrutador escreve
    //      ("Desenvolvedor React", "Dev .NET") muito mais do que "front-end";
    //   3. 'dev' continua existindo como SOBRA, para o titulo generico
    //      ("Desenvolvedor de Software", "Tech Lead"). Nao some com a vaga:
    //      quem escolheu 'dev' no perfil recebe as quatro (ver expandirAreas).
    //
    // Mobile e QA sao testados ANTES disto, entao "React Native" e "Test
    // Engineer" nao caem aqui.
    if (/full[\s-]?stack|\bmern\b|\bmean stack/.test(t)) return 'fullstack';
    if (/front[\s-]?end|\breact\b|reactjs|angular|\bvue\b|vuejs|svelte|next\.?js|\bnuxt\b|\bhtml\b|\bcss\b|\bsass\b|tailwind|\bjavascript\b|\btypescript\b|\bui developer\b|desenvolvedor[a]?\s+web|web(?:site)? development/.test(t)) return 'frontend';
    if (/back[\s-]?end|\.net\b|dotnet|\bc#|\bjava\b|python|\bnode(?:\.?js)?\b|\bphp\b|golang|\bruby\b|\brust\b|c\+\+|spring|django|laravel|\brails\b|\bapis?\b|microservi[cç]os?|microservices/.test(t)) return 'backend';
    // ERP / SAP / CRM: carreira de TI, mas não é desenvolvimento. Antes caía em
    // 'other' ou, pelas skills, em 'backend', e ia parar no feed de dev. Fica
    // DEPOIS de front/back ("Front-end React e Salesforce" é vaga de front) e
    // ANTES do dev genérico ("Salesforce Developer" não é para quem quer Java).
    if (/\bsap\b|\babap\b|fiori|\btotvs\b|protheus|salesforce|servicenow|oracle (?:ebs|e-business|cpq|fusion|hcm|erp|apps|r12|integration)|dynamics 365|\berp\b|siebel|workday|netsuite|\bcpq\b|\bpega\b|\btasy\b|successfactors|\binfor\b|lawson|zendesk|\bmdg\b|master data|qualtrics/.test(t)) return 'erp';
    if (/desenvolvedor|developer|programador|engenheir[oa]s?\s+de\s+software|software engineer|\bengineer\b|kotlin|swift|tech lead|arquitet[oa] de software|software architect|analista de sistemas|arquitet[oa] (?:\w+ )*?(?:de )?solu[çc]|solutions? architect|arquitet[oa] de integra|integration|desenvolvimento de software|software (?:development )?intern|desarrollador|ingenier[oa] (?:de software|inform[áa]tic)|\bit (?:professional|roles|positions)|multiple (?:it|technology)|appian|outsystems|mulesoft|low[- ]?code|\brpa\b|cobol|mainframe|technical lead|l[íi]der t[ée]cnic[oa]|\btech (?:intern|lead|analyst)|\bsde\b|\bdevs?\b|app development|\bsql\b|tecnologia da informa[çc][ãa]o|analista de desenvolvimento|\bia\b|intelig[êe]ncia artificial|\bai\b|\bllms?\b|(?:qe|technical|sql) architect|systems? analyst|application consultant|engenharia de software|coordenador[a]? de desenvolvimento|engineering manager|arquitect[oa] de soluciones/.test(t)) return 'dev';
    // Suporte / Service Desk — carreira de TI legítima que caía inteira em 'other'.
    // "de TI" aceita qualquer prefixo de cargo: assistente e auxiliar de TI são
    // tão comuns quanto analista, e escreviam-se só como 'other'.
    if (/service desk|help ?desk|suporte t[ée]cnico|analista de suporte|suporte n[123]\b|(?:analista|assistente|auxiliar|t[ée]cnic[oa])s?\s+(?:de\s+)?ti\b|t[ée]cnic[oa] em inform[áa]tica|infraestrutura de ti|t[ée]cnic[oa] de (?:suporte|inform[áa]tica)|suporte (?:em|de) (?:ti|campo)|\bit support|support (?:specialist|analyst|technician|associate|engineer)|application support|coordenador[a]? de suporte|soporte|(?:gerente|coordenador[a]?|supervisor[a]?) de ti\b|remote support|tier [123]\b|estagi[áa]ri[oa] de ti\b|escalation analyst|microsoft 365|office 365|\bm365\b|copilot/.test(t)) return 'suporte';
    // Nuvem genérica por ÚLTIMO: "Desenvolvedor Java AWS" é back-end, e testar
    // `aws` lá em cima (com o resto de infra) mandava 120 vagas de dev para Infra.
    if (/\bcloud\b|\bnuvem\b|\bazure\b|\baws\b|\bgcp\b|\boci\b|sustenta[çc][ãa]o|linux/.test(t)) return 'devops';
    // Sobras de tech sem área clara: "Oracle" (DBA, PL/SQL, APEX) e "architect"
    // em inglês, que no LinkedIn é quase sempre de TI.
    if (/\boracle\b|pl\/?sql|\barchitect\b/.test(t)) return 'dev';
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
    // "Engenheiro(a) de Dados" não casava com "engenheir[oa] de dados": o "(a)"
    // fica no meio. Tirar a marca de gênero antes resolve todas as regras de uma
    // vez, em vez de remendar regex por regex.
    const titulo = String(job.JobTitle || '').toLowerCase().replace(/\((?:a|o|as|os|e|es)\)/g, '');

    // 1. O título é o sinal confiável.
    const porTitulo = areaTech(titulo);
    if (porTitulo) return porTitulo;

    // 2. Título de outra profissão: skill alucinada não reverte.
    if (NONTECH.test(titulo)) return 'nontech';

    // 3. Título sem informação ("Vaga", "Estamos contratando"): as skills são o
    //    único sinal que resta, então valem — com o risco assumido de errar aqui.
    if (tituloVago(titulo)) {
        const comSkills = `${titulo} ${parseArr(job.Skills).join(' ')}`.toLowerCase();
        return areaTech(comSkills) || 'other';
    }

    // 4. Título CLARO que não casou com nenhuma área de tech: é outra profissão.
    //    Antes caía em 'other' (que passa no feed) e o passo 3 rodava para ele
    //    também, ao contrário do que este comentário sempre disse. Medido em
    //    25/10/2026: das ~1150 vagas do monitoramento novo, 510 foram para
    //    'other' (Payroll, Esteticista, Vigia, Soldador...) e "Assistente
    //    Financeiro" virava 'data' porque a IA listou Power BI nas skills.
    //    Lista de profissões não-tech nunca fecha; a de tech é finita.
    return 'nontech';
}

// Título que não diz o cargo: aí, e só aí, as skills decidem.
function tituloVago(t) {
    const limpo = t.replace(/[^a-zà-ú ]/gi, ' ').replace(/\s+/g, ' ').trim();
    if (limpo.length < 4) return true;
    // "Analista Júnior", "Especialista Sênior": cargo + nível, sem dizer de quê.
    const semNivel = limpo
        .replace(/\b(?:j[úu]nior|jr|pleno|pl|s[êe]nior|sr|senior|i{1,3}|iv|estagi[áa]ri[oa]|trainee|de|em|da|do)\b/g, ' ')
        .replace(/\b(?:analista|assistente|auxiliar|especialista|consultor[a]?|profissional|coordenador[a]?|l[íi]der)\b/g, ' ')
        .trim();
    if (!semNivel) return true;
    return /^(?:nova |novas )?(?:vagas?|oportunidades?|estamos contratando|contratando|hiring|we are hiring|job|jobs|freela|freelancer|v[áa]rias vagas|vagas abertas|vaga aberta|banco de talentos|intern|internship|est[áa]gio|estagi[áa]ri[oa]|trainee|v[áa]ri[oa]s(?: \w+)?|various(?: \w+)?|multiple(?: \w+)?)(?: aberta| abertas| de emprego| dispon[íi]ve(?:l|is))?$/.test(limpo);
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
export const CLASSIFY_VERSION = 4;

const BR_HINT = /brasil|brazil|s[ãa]o paulo|rio de janeiro|belo horizonte|curitiba|porto alegre|bras[íi]lia|fortaleza|recife|salvador|campinas|florian[óo]polis/i;

// Sinais NEGATIVOS. Sem eles, post em espanhol que citava "Brasil" numa lista de
// países (ou só tinha acento) passava como BR: em 25/10/2026, vagas de
// Guadalajara, CDMX, Honduras e Panamá estavam no feed dos usuários.
// Sem .it, .co e .do: "runtalent.it" e "inovan.do" são empresas brasileiras
// (trocadilho com o domínio) e .co é genérico de startup, não só da Colômbia.
const TLD_FORA = /\.(?:mx|ar|cl|pe|uy|ec|bo|py|ve|cr|pa|hn|gt|sv|ni|es|pt|in|uk|de|fr)$/;
const LUGAR_FORA = /m[ée]xico|\bcdmx\b|guadalajara|monterrey|quer[ée]taro|costa rica|panam[áa]|honduras|guatemala|el salvador|nicar[áa]gua|colombia|bogot[áa]|medell[íi]n|per[úu]\b|(?<!faria )\blima\b|chile|argentina|buenos aires|uruguay|montevideo|ecuador|venezuela|espa[ñn]a|madrid|barcelona|portugal|lisboa|\bindia\b|bangalore|hyderabad|united states|\busa\b/i;
// Palavras que só existem em espanhol (as que coincidem com o português,
// como "requisitos", não contam).
const ESPANHOL = /\b(?:experiencia|vacante|postula|postúlate|ofrecemos|conocimientos|inglés|empresa líder|sueldo|prestaciones|desarrollador|ingeniero|trabajo|años de)\b/gi;
const PORTUGUES = /\b(?:experiência|vaga|currículo|oferecemos|conhecimentos|inglês|salário|benefícios|desenvolvedor|engenheiro|trabalho|anos de)\b/gi;

/** Heurística de país da vaga (mesma lógica do scraper). */
export function jobIsBR(job) {
    const dom = (job.Email || '').split('@')[1]?.toLowerCase() || '';
    if (dom.endsWith('.br')) return true;
    const local = String(job.Location || '');
    if (BR_HINT.test(local) || /\/(?:sp|rj|mg|rs|pr|sc|ba|pe|ce|df|go|es)\b/i.test(local)) return true;
    // abler.in é plataforma de vagas brasileira: o domínio não diz o país.
    if (TLD_FORA.test(dom) && !dom.endsWith('abler.in')) return false;
    if (LUGAR_FORA.test(local) && !BR_HINT.test(local)) return false;
    const desc = String(job.Description || '');
    const es = (desc.match(ESPANHOL) || []).length;
    const pt = (desc.match(PORTUGUES) || []).length;
    if (es > pt) return false;
    const text = `${local} ${job.JobTitle || ''} ${desc}`;
    if (BR_HINT.test(text)) return true;
    return /[ãõçáéíóúâê]/i.test(desc) && /\b(vaga|currículo|contratando|desenvolvedor)\b/i.test(text);
}

/**
 * Tudo o que dá para saber da vaga sem conhecer o usuário. É o que vai para as
 * colunas derivadas — e o que o SQL passa a filtrar.
 */
/** Marca gravada em "AiClassification" quando o admin tira a vaga do feed. */
export const REMOVIDA_PELO_ADMIN = 'removida-admin';

/**
 * Área FINAL da vaga: a decisão humana vence a regra. Sem isto, a próxima
 * reclassificação (todo CLASSIFY_VERSION novo) devolveria ao feed o que o admin
 * tirou. Usada pelo SQL (via classifyJob) E pelo passesFilters, senão os dois
 * filtros divergem.
 */
export function areaDaVaga(job) {
    return job.AiClassification === REMOVIDA_PELO_ADMIN ? 'nontech' : detectArea(job);
}

export function classifyJob(job) {
    return {
        area: areaDaVaga(job),
        level: detectLevel(`${job.JobTitle || ''} ${job.Description || ''}`),
        mods: detectModality(job), // array ou null ("não dá para afirmar")
        isBR: jobIsBR(job),
        version: CLASSIFY_VERSION,
    };
}
