import { detectModality, parseArr } from './classify.js';

// =========================
// Filtro por estado e cidade
// =========================
// Pedido de usuário (05/11/2026): recebeu vaga híbrida em Recife sem morar lá.
// Vale só para vaga híbrida ou presencial. Remota aparece para todos, e o filtro
// erra sempre para o lado de MOSTRAR: vaga sem local, sem modalidade ou com um
// local que não reconhecemos passa. Decisão do dono: não esconder vaga boa.
//
// Lê o campo Location e, quando ele está vazio, só as linhas do post que anunciam
// o local ("📍 Local: Recife/PE"). Medido em 05/11/2026: 93% das híbridas e
// presenciais dos últimos 60 dias têm o campo, e das mais antigas só 21%. O resto
// do texto não serve: o título tem sigla que parece estado ("SAP PO/PI") e a
// descrição cita sede, cliente e outras vagas do mesmo post.

/** A cidade é procurada no local, e diz o estado quando o local não diz. */
const CIDADES = {
    'sao paulo': 'SP', campinas: 'SP', barueri: 'SP', alphaville: 'SP', osasco: 'SP', guarulhos: 'SP',
    'santo andre': 'SP', 'sao bernardo do campo': 'SP', 'sao caetano do sul': 'SP', jundiai: 'SP',
    sorocaba: 'SP', 'ribeirao preto': 'SP', 'sao jose dos campos': 'SP', santos: 'SP', hortolandia: 'SP',
    'rio de janeiro': 'RJ', niteroi: 'RJ', macae: 'RJ',
    'belo horizonte': 'MG', betim: 'MG', contagem: 'MG', uberlandia: 'MG', 'juiz de fora': 'MG',
    vitoria: 'ES', curitiba: 'PR', londrina: 'PR', maringa: 'PR',
    florianopolis: 'SC', joinville: 'SC', blumenau: 'SC', itajai: 'SC',
    'porto alegre': 'RS', 'caxias do sul': 'RS', 'novo hamburgo': 'RS',
    brasilia: 'DF', goiania: 'GO', cuiaba: 'MT', 'campo grande': 'MS',
    salvador: 'BA', recife: 'PE', fortaleza: 'CE', natal: 'RN', 'joao pessoa': 'PB', maceio: 'AL',
    aracaju: 'SE', teresina: 'PI', 'sao luis': 'MA', manaus: 'AM', belem: 'PA', palmas: 'TO',
    'porto velho': 'RO', 'rio branco': 'AC', macapa: 'AP', 'boa vista': 'RR',
};

// "Pará" fica de fora: sem acento vira a preposição "para".
const ESTADOS = {
    'minas gerais': 'MG', 'espirito santo': 'ES', parana: 'PR', 'santa catarina': 'SC',
    'rio grande do sul': 'RS', 'distrito federal': 'DF', goias: 'GO', 'mato grosso do sul': 'MS',
    bahia: 'BA', pernambuco: 'PE', ceara: 'CE', 'rio grande do norte': 'RN', paraiba: 'PB',
    alagoas: 'AL', sergipe: 'SE', piaui: 'PI', maranhao: 'MA', amazonas: 'AM', tocantins: 'TO',
};

const SIGLA = /(?:^|[\s/,(|–—-])(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)(?=$|[\s/,).|–—-])/g;

/** Sem acento, minúsculo e com espaço nas pontas: " sao paulo sp ". */
const limpar = (s) => ` ${String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

const LINHA_DE_LOCAL = /(?:📍|\blocal(?:iza[çc][ãa]o|idade)?\b|\bcidade\b|\bh[íi]brido\s+(?:em|-|–|\())\s*[:\-–(]?\s*([^\n|•]{3,70})/gi;

/** Estados e cidades que a vaga afirma. */
export function localDaVaga(job) {
    const bruto = String(job.Location || '').trim()
        || [...String(job.Description || '').matchAll(LINHA_DE_LOCAL)].map((m) => m[1]).join(' , ');
    const texto = limpar(bruto);
    const ufs = new Set([...bruto.matchAll(SIGLA)].map((m) => m[1]));
    const cidades = Object.keys(CIDADES).filter((c) => texto.includes(` ${c} `));
    for (const c of cidades) ufs.add(CIDADES[c]);
    for (const [nome, uf] of Object.entries(ESTADOS)) if (texto.includes(` ${nome} `)) ufs.add(uf);
    return { ufs, cidades, texto };
}

/** A vaga é híbrida ou presencial, em lugar conhecido, e fora do que a pessoa marcou? */
export function foraDoLocal(job, profile) {
    const estados = parseArr(profile?.States);
    const cidades = parseArr(profile?.Cities).map((c) => limpar(c).trim()).filter(Boolean);
    if (!estados.length && !cidades.length) return false;
    if (profile.Region === 'intl') return false;

    const modalidades = detectModality(job);
    if (!modalidades || modalidades.includes('remoto')) return false;

    const local = localDaVaga(job);
    if (!local.ufs.size) return false;
    if ([...local.ufs].some((uf) => estados.includes(uf))) return false;
    if (cidades.some((c) => local.texto.includes(` ${c} `))) return false;
    // A vaga diz só "SP" e a pessoa marcou Campinas: pode ser lá, então passa.
    if (!local.cidades.length && cidades.some((c) => local.ufs.has(CIDADES[c]))) return false;
    return true;
}

// =========================
// Vaga exclusiva para PCD
// =========================
// Mesmo pedido: a vaga exclusiva chegou para quem não é PCD. A frase tem de ser
// sobre a VAGA. Medido na base: "também é destinada a PcD" é o contrário de
// exclusiva, e "pipeline exclusivo PcD" é outro processo. "Afirmativa" fica de
// fora porque os posts de curadoria marcam um item entre dez, e as outras nove
// vagas sairiam do feed junto.
const EXCLUSIVA_PCD = /\b(?:vagas?|oportunidades?|processo(?:\s+seletivo)?)\s+(?:exclusiv[ao]s?|somente|apenas|destinad[ao]s?)\s+(?:(?:para|pra|a|à|às|aos)\s+)?(?:pcds?\b|pessoas?\s+com\s+defici[êe]ncia|profissiona(?:l|is)\s+com\s+defici[êe]ncia)/i;

/** O post diz que a vaga é só para pessoas com deficiência? */
export function vagaExclusivaPcd(job) {
    return EXCLUSIVA_PCD.test(`${job.JobTitle || ''} ${job.Description || ''}`);
}
