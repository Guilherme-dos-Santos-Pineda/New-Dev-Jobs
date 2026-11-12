// =========================
// A IA não pode pôr no currículo o que a pessoa não escreveu (12/11/2026)
// =========================
// Relato de usuários: o currículo reescrito trazia cidade e ano de formatura que
// não estavam no original (a IA deduz a cidade pelo DDD ou pela empresa, e o ano
// pelo curso). O prompt já proíbe; esta conferência é a garantia: todo ANO, toda
// CIDADE conhecida e cada pedaço do CONTATO precisam aparecer no texto original.
// O que não aparece sai. Vale para a análise e para as versões por tipo de vaga
// (as duas passam por lerResposta em analiseCvLogic.js).

const dobra = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Capitais, cidades grandes e estados: o que a IA costuma "completar".
export const LUGARES = [
    'sao paulo', 'rio de janeiro', 'belo horizonte', 'brasilia', 'salvador', 'fortaleza', 'recife', 'curitiba',
    'porto alegre', 'manaus', 'belem', 'goiania', 'campinas', 'sao luis', 'maceio', 'natal', 'teresina',
    'joao pessoa', 'aracaju', 'cuiaba', 'campo grande', 'florianopolis', 'vitoria', 'palmas', 'porto velho',
    'rio branco', 'macapa', 'boa vista', 'sao jose dos campos', 'ribeirao preto', 'sorocaba', 'santos',
    'guarulhos', 'osasco', 'santo andre', 'sao bernardo do campo', 'jundiai', 'uberlandia', 'contagem',
    'juiz de fora', 'londrina', 'maringa', 'joinville', 'blumenau', 'caxias do sul', 'niteroi', 'campos dos goytacazes',
    'feira de santana', 'vila velha', 'barueri', 'alphaville', 'piracicaba', 'bauru',
    'sao carlos', 'limeira', 'taubate', 'chapeco', 'pelotas', 'canoas', 'anapolis', 'aparecida de goiania',
    'minas gerais', 'parana', 'santa catarina', 'rio grande do sul', 'bahia', 'pernambuco', 'ceara', 'goias',
    'espirito santo', 'mato grosso', 'mato grosso do sul', 'amazonas', 'maranhao', 'paraiba', 'piaui',
    'alagoas', 'sergipe', 'tocantins', 'rondonia', 'amapa', 'roraima', 'distrito federal',
];

// Letra sem acento → classe com as acentuadas, para achar "São Paulo" e "Sao Paulo".
const ACENTOS = { a: '[aáàâã]', e: '[eéê]', i: '[ií]', o: '[oóôõ]', u: '[uúü]', c: '[cç]' };
const escapar = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function regexDoLugar(lugar) {
    const nome = lugar.split('').map((c) => ACENTOS[c] || escapar(c)).join('');
    // Leva junto o "em"/"de"/vírgula antes e o "/SP" ou "- SP" depois.
    return new RegExp('(?:\\s*(?:em|de|,|-|\\|)\\s*)?\\b' + nome + '\\b(?:\\s*[/-]\\s*[A-Z]{2}\\b)?', 'gi');
}
const LUGAR_RE = LUGARES.map((lugar) => ({ lugar, re: regexDoLugar(lugar) }));
const ANO = /\b(19[5-9]\d|20[0-4]\d)\b/g;
const UFS = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';
const CIDADE_UF = new RegExp('(\\s*(?:em|,|\\|)?\\s*)\\b([A-ZÀ-Ú][A-Za-zÀ-ú\']+(?: (?:d[aeo]s?|[A-ZÀ-Ú][A-Za-zÀ-ú\']+))*)\\s*[/-]\\s*(?:' + UFS + ')\\b', 'g');
const ANO_NO_ORIGINAL =/(?<!\d)(19[5-9]\d|20[0-4]\d)(?!\d)/g;

const arruma = (s) => String(s)
    .replace(/\(\s*\)/g, '')
    .replace(/\s*[,|/–-]\s*(?=[,|/–-]|$)/g, '')
    .replace(/^\s*[,|/–-]\s*/, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

/**
 * Tira de `s` os anos e (com `cidades`) as cidades que não estão no original.
 * Nome de empresa e de faculdade passa só pelos anos: "Universidade de São Paulo"
 * sem a cidade vira um nome quebrado (visto numa análise real, 12/11/2026).
 */
function semInventado(s, original, anosOriginais, { cidades = true } = {}) {
    if (!s) return s;
    let t = String(s).replace(ANO, (ano) => (anosOriginais.has(ano) ? ano : ''));
    if (cidades) {
        for (const { lugar, re } of LUGAR_RE) {
            if (original.includes(lugar)) continue;
            t = t.replace(re, '');
        }
        // Qualquer cidade no formato "Cidade/UF" ou "Cidade - UF", mesmo fora da
        // lista (a IA tira a cidade do DDD: "(16)" vira "Ribeirão Preto/SP").
        t = t.replace(CIDADE_UF, (trecho, antes, cidade) => (original.includes(dobra(cidade).trim()) ? trecho : ''));
    }
    return t === s ? s : arruma(t);
}

/**
 * Confere o currículo reescrito contra o texto original e devolve uma cópia sem
 * o que foi inventado. Sem texto original, não mexe.
 */
export function conferirFatos(cv, textoCv) {
    const original = dobra(textoCv);
    if (!original.trim() || !cv) return cv;
    // No original o ano vem às vezes colado na palavra seguinte ("2018 - 2020Philip
    // Morris", texto extraído do PDF): por isso não dá para exigir \b dos dois lados.
    const anos = new Set(original.match(ANO_NO_ORIGINAL) || []);
    const s = (v) => semInventado(v, original, anos);
    const nome = (v) => semInventado(v, original, anos, { cidades: false });
    const l = (arr) => (arr || []).map(s).filter(Boolean);
    return {
        ...cv,
        titulo: s(cv.titulo),
        // Contato: só sai cidade ou ano inventado. Email, telefone e link ficam: o link
        // do PDF costuma ser hiperlink e não aparece no texto extraído, e tirar contato
        // verdadeiro é pior que o problema (medido em 20 análises reais, 12/11/2026).
        contato: s(cv.contato),
        resumoProfissional: s(cv.resumoProfissional),
        habilidades: (cv.habilidades || []).map((h) => ({ ...h, itens: s(h.itens) })),
        experiencias: (cv.experiencias || []).map((e) => ({ ...e, cargo: s(e.cargo), empresa: nome(e.empresa), periodo: s(e.periodo), atividades: l(e.atividades) })),
        projetos: (cv.projetos || []).map((p) => ({ ...p, descricao: l(p.descricao) })),
        formacao: (cv.formacao || []).map((f) => ({ ...f, curso: nome(f.curso), instituicao: nome(f.instituicao), periodo: s(f.periodo) })),
        certificacoes: l(cv.certificacoes),
    };
}
