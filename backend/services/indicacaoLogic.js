// =========================
// Origem e "Indique e ganhe" (regra pura, 14/11/2026)
// =========================
// Por que existe: até aqui não dava para saber de onde vinha quem criava conta
// (Reddit, LinkedIn, grupo do WhatsApp, Google), e toda decisão de divulgação era
// palpite. E quem acaba a cota grátis do dia não tinha o que fazer além de pagar.
//
// Indicação: quem indica e quem foi indicado ganham +10 envios por dia por 7 dias
// quando o indicado faz o PRIMEIRO envio real pelo Gmail. Não é no cadastro: conta
// falsa não custa nada, conectar o Gmail e mandar um currículo de verdade custa.
// Cada indicação soma 7 dias, até 60 dias à frente.

export const BONUS_ENVIOS = 10;
export const DIAS_POR_INDICACAO = 7;
export const TETO_DIAS = 60;
/** A indicação só vale para conta criada há pouco: senão qualquer um "se indica" depois. */
export const HORAS_PARA_INDICAR = 72;

const DIA_MS = 86400000;

// Sem 0/O/1/I/L: o código é lido em voz alta e digitado à mão.
const ALFABETO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function gerarCodigo(aleatorio = Math.random, tamanho = 6) {
    let s = '';
    for (let i = 0; i < tamanho; i++) s += ALFABETO[Math.floor(aleatorio() * ALFABETO.length)];
    return s;
}

/** Código como veio da URL: maiúsculo, só o alfabeto, 4 a 12 caracteres. */
export function normalizarCodigo(v) {
    const s = String(v || '').trim().toUpperCase();
    return /^[A-Z0-9]{4,12}$/.test(s) ? s : null;
}

/** Limite do dia com o bônus de indicação, se ainda valer. */
export function limiteComBonus(limiteDoPlano, bonusAte, agora = Date.now()) {
    const vale = bonusAte && new Date(bonusAte).getTime() > agora;
    return limiteDoPlano + (vale ? BONUS_ENVIOS : 0);
}

/** Novo fim do bônus: soma 7 dias ao que sobrou (ou a hoje), nunca mais que 60 dias à frente. */
export function novoBonusAte(bonusAte, agora = Date.now()) {
    const atual = bonusAte ? new Date(bonusAte).getTime() : 0;
    const base = Math.max(atual, agora);
    return new Date(Math.min(base + DIAS_POR_INDICACAO * DIA_MS, agora + TETO_DIAS * DIA_MS));
}

/**
 * Pode gravar a indicação nesta conta? Só conta nova, sem indicação anterior,
 * sem envio ainda, e nunca de si mesma.
 */
export function podeIndicar({ indicado, quemIndicou, jaEnviou }, agora = Date.now()) {
    if (!indicado || !quemIndicou) return false;
    if (indicado.Id === quemIndicou.Id) return false;
    if (indicado.IndicadoPor) return false;
    if (jaEnviou) return false;
    const criada = new Date(indicado.CreatedAt).getTime();
    return Number.isFinite(criada) && agora - criada <= HORAS_PARA_INDICAR * 3600000;
}

/** O prêmio sai? Mesmo Gmail nas duas contas é a mesma pessoa. */
export function premioVale({ indicado, quemIndicou }) {
    if (!indicado?.IndicadoPor || indicado.IndicacaoPremiadaEm || !quemIndicou) return false;
    const a = String(indicado.GoogleEmail || '').toLowerCase();
    const b = String(quemIndicou.GoogleEmail || '').toLowerCase();
    if (a && a === b) return false;
    if (String(indicado.Email || '').toLowerCase() === String(quemIndicou.Email || '').toLowerCase()) return false;
    return true;
}

// =========================
// Canal de origem
// =========================
// Ordem: utm_source (link que a gente mesmo divulgou) > indicação > site de onde
// veio > direto. O nome do canal é curto e fixo para os mais comuns, para o
// funil não ficar com "l.facebook.com", "m.facebook.com" e "facebook.com" separados.
const HOSTS = [
    [/(^|\.)google\./, 'google'],
    [/(^|\.)bing\.com$/, 'bing'],
    [/(^|\.)duckduckgo\.com$/, 'duckduckgo'],
    [/(^|\.)reddit\.com$/, 'reddit'],
    [/(^|\.)(linkedin\.com|lnkd\.in)$/, 'linkedin'],
    [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
    [/(^|\.)(t\.co|twitter\.com|x\.com)$/, 'x'],
    [/(^|\.)(facebook\.com|fb\.com|instagram\.com)$/, 'meta'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
    [/(^|\.)(t\.me|telegram\.org)$/, 'telegram'],
    [/(^|\.)tabnews\.com\.br$/, 'tabnews'],
    [/(^|\.)github\.com$/, 'github'],
    [/(^|\.)discord(app)?\.com$/, 'discord'],
    [/(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai)$/, 'ia'],
];

export function limparCanal(v) {
    const s = String(v || '').toLowerCase().trim().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
    return s || null;
}

function hostDe(url) {
    try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
}

/** Canal a partir do que o navegador viu na primeira visita. */
export function canalDaOrigem({ utm_source, ref, referrer } = {}, meuHost = 'newdevjobs.xyz') {
    const utm = limparCanal(utm_source);
    if (utm) {
        for (const [re, nome] of HOSTS) if (re.test(utm) || re.test(`${utm}.com`)) return nome;
        return utm;
    }
    if (normalizarCodigo(ref)) return 'indicacao';
    const host = hostDe(referrer);
    if (!host || host === meuHost || host.endsWith(`.${meuHost}`)) return 'direto';
    for (const [re, nome] of HOSTS) if (re.test(host)) return nome;
    return limparCanal(host) || 'outro';
}

/** O que vai para Users.Origem: só campos conhecidos, cada um curto. */
export function origemParaGravar(o = {}, meuHost) {
    const corta = (v, n = 80) => (v == null || v === '' ? undefined : String(v).slice(0, n));
    return {
        canal: canalDaOrigem(o, meuHost),
        utm_source: corta(o.utm_source, 40),
        utm_medium: corta(o.utm_medium, 40),
        utm_campaign: corta(o.utm_campaign, 60),
        referrer: corta(hostDe(o.referrer) || undefined, 80),
        pagina: corta(o.pagina, 80),
        em: corta(o.em, 30),
    };
}
