#!/usr/bin/env node
// Gera a versão em inglês da landing a partir do HTML em português.
//
//   node pages/build-en.mjs [destino]     (padrão: pages/en/index.html)
//
// POR QUE GERAR EM VEZ DE MANTER DUAS PÁGINAS
// O inglês já existia no `index.html` como o dicionário I18N_EN, aplicado por
// JavaScript na mesma URL — ótimo para humanos, invisível para o Google, que
// indexa o HTML servido. Duplicar o arquivo resolveria a indexação e criaria o
// problema clássico: duas páginas que divergem na primeira edição.
//
// Aqui o português continua sendo a única fonte editável e o inglês é derivado
// dele no deploy, usando o MESMO dicionário. Chave nova? Só marcar o elemento
// com data-i18n e acrescentar a tradução ao I18N_EN.
//
// Rodado automaticamente por deploy/oracle/deploy-static.sh.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, 'index.html');
const OUT = resolve(process.argv[2] || resolve(HERE, 'en/index.html'));
const BASE = 'https://newdevjobs.xyz';

/** Extrai o objeto I18N_EN do <script> da landing e o avalia. */
function extractDict(html) {
    const start = html.indexOf('const I18N_EN = {');
    if (start === -1) throw new Error('I18N_EN não encontrado em index.html');
    // Varre a partir da chave de abertura contando profundidade, para achar o
    // fecho certo mesmo com objetos aninhados no futuro.
    const open = html.indexOf('{', start);
    let depth = 0, end = -1;
    for (let i = open; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) throw new Error('I18N_EN sem fecho');
    // O literal vem do nosso próprio repositório, não de entrada externa.
    return new Function(`return ${html.slice(open, end + 1)}`)();
}

/**
 * Substitui o innerHTML de todo elemento com data-i18n cuja chave exista no
 * dicionário. Conta profundidade da mesma tag, então continua correto se um dia
 * um elemento traduzível contiver outro do mesmo tipo.
 */
function translate(html, dict) {
    const openTag = /<(\w+)[^>]*\bdata-i18n="([^"]+)"[^>]*>/g;
    let out = '', last = 0, m, aplicadas = 0;
    const semTraducao = [];

    while ((m = openTag.exec(html)) !== null) {
        const [full, tag, key] = m;
        // Acha o fecho correspondente contando aberturas/fechamentos da tag.
        const pat = new RegExp(`</?${tag}\\b`, 'gi');
        pat.lastIndex = m.index + full.length;
        let depth = 1, close = null, mm;
        while (depth > 0 && (mm = pat.exec(html)) !== null) {
            depth += mm[0].startsWith('</') ? -1 : 1;
            if (depth === 0) close = mm;
        }
        if (!close) throw new Error(`tag <${tag}> sem fechamento (chave ${key})`);

        if (Object.prototype.hasOwnProperty.call(dict, key)) {
            out += html.slice(last, m.index + full.length) + dict[key];
            last = close.index;
            aplicadas++;
        } else {
            semTraducao.push(key);
        }
        openTag.lastIndex = close.index;
    }
    out += html.slice(last);
    return { html: out, aplicadas, semTraducao };
}

/** Troca o content de uma meta por outro valor (por name= ou property=). */
function setMeta(html, attr, name, value) {
    const re = new RegExp(`(<meta ${attr}="${name}" content=")[^"]*(")`);
    if (!re.test(html)) throw new Error(`meta ${attr}="${name}" não encontrada`);
    return html.replace(re, `$1${value}$2`);
}

const src = await readFile(SRC, 'utf8');
const dict = extractDict(src);

let html = translate(src, dict);
const { aplicadas, semTraducao } = html;
html = html.html;

// --- idioma do documento e título ---
html = html.replace('<html lang="pt-BR">', '<html lang="en">');
html = html.replace(/<title>[^<]*<\/title>/, `<title>${dict.title}</title>`);

// --- metadados do <head> (não têm data-i18n) ---
html = setMeta(html, 'name', 'description', dict['meta.description']);
html = setMeta(html, 'name', 'keywords', dict['meta.keywords']);
html = setMeta(html, 'property', 'og:title', dict['meta.ogTitle']);
html = setMeta(html, 'property', 'og:description', dict['meta.ogDescription']);
html = setMeta(html, 'property', 'og:image:alt', dict['meta.ogImageAlt']);
html = setMeta(html, 'name', 'twitter:title', dict['meta.ogTitle']);
html = setMeta(html, 'name', 'twitter:description', dict['meta.twitterDescription']);
html = setMeta(html, 'property', 'og:locale', 'en_US');
html = setMeta(html, 'property', 'og:locale:alternate', 'pt_BR');

// --- canonical próprio + og:url (o hreflang recíproco já vem do PT) ---
html = html.replace(
    `<link rel="canonical" href="${BASE}/">`,
    `<link rel="canonical" href="${BASE}/en/">`);
html = setMeta(html, 'property', 'og:url', `${BASE}/en/`);

// --- JSON-LD ---
html = html.replace('"inLanguage": "pt-BR"', '"inLanguage": "en"');
html = html.replace(
    /("description": ")[^"]*(")/,
    `$1${dict['meta.jsonldDescription']}$2`);

// --- links relativos: sob /en/ resolveriam para /en/docs.html (404) ---
// docs, termos e privacidade seguem só em português, então apontam para a raiz.
for (const f of ['favicon.svg', 'docs.html', 'termos.html', 'privacidade.html']) {
    html = html.replaceAll(`href="${f}"`, `href="/${f}"`);
}

// --- seletor de idioma: EN ativo em vez de PT ---
html = html.replace('class="lang-opt active" data-lang="pt"', 'class="lang-opt" data-lang="pt"');
html = html.replace('class="lang-opt" data-lang="en"', 'class="lang-opt active" data-lang="en"');

// --- quem chega direto em /en/ (via Google) leva o inglês para o app ---
// Só a página EN faz isso: a URL já é o sinal explícito de escolha.
html = html.replace('</body>', `<script>try{localStorage.setItem('lang','en')}catch(e){}</script>\n</body>`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, html, 'utf8');

console.log(`✅ ${OUT}`);
console.log(`   ${aplicadas} elementos traduzidos`);
if (semTraducao.length) {
    console.log(`   ⚠️  ${semTraducao.length} sem tradução (ficaram em PT): ${semTraducao.join(', ')}`);
}
