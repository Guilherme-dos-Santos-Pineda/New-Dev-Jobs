// =========================
// Engine de templates de email
// =========================

export const DEFAULT_LANG = 'pt';

// Metadados das variáveis (usados pela UI e documentação)
export const VARIABLES = [
    { key: 'job_title', label: '{job_title}', desc: 'Título/cargo da vaga' },
    { key: 'company', label: '{company}', desc: 'Nome da empresa' },
    { key: 'sender_name', label: '{sender_name}', desc: 'Seu nome como remetente' },
    { key: 'contact_info', label: '{contact_info}', desc: 'Suas informações de contato' },
    { key: 'whatsapp_link', label: '{whatsapp_link}', desc: "Palavra 'WhatsApp' clicável que abre conversa" },
    { key: 'linkedin_link', label: '{linkedin_link}', desc: "Palavra 'LinkedIn' clicável que abre seu perfil" },
    { key: 'github_link', label: '{github_link}', desc: "Palavra 'GitHub' clicável que abre seu perfil" },
    { key: 'portfolio', label: '{portfolio}', desc: "Palavra 'Portfólio' clicável que abre seu site" },
];

export const DEFAULTS = {
    pt: {
        subject: 'Candidatura para {job_title} na {company}',
        body:
`Olá {company},

Me chamo {sender_name} e gostaria de me candidatar à vaga de {job_title}. Acredito que minhas habilidades e experiências podem contribuir positivamente para a equipe.

Caso queira falar comigo diretamente, estou disponível no {whatsapp_link} ou no {linkedin_link}.

Segue abaixo minhas informações de contato:
{contact_info}

Atenciosamente,
{sender_name}`,
    },
};

export function defaultTemplate(lang = DEFAULT_LANG) {
    return DEFAULTS[lang] || DEFAULTS.pt;
}

// ---- helpers ----
function escapeHtml(s = '') {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function onlyDigits(s = '') {
    return String(s).replace(/\D/g, '');
}

function normalizeUrl(url) {
    if (!url) return null;
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function link(url, label) {
    const u = normalizeUrl(url);
    if (!u) return { html: '', text: '' };
    return {
        html: `<a href="${escapeHtml(u)}" target="_blank" rel="noopener">${label}</a>`,
        text: `${label} (${u})`,
    };
}

function value(v) {
    const s = v == null ? '' : String(v);
    return { html: escapeHtml(s), text: s };
}

// Cargo amigável por área (usado quando a vaga não tem título claro).
const AREA_ROLE = {
    dev: 'Desenvolvedor(a)', qa: 'QA', po: 'Product Owner', data: 'Dados & Analytics',
    design: 'Design/UX', devops: 'DevOps', mobile: 'Desenvolvedor(a) Mobile',
};
const parseAreas = (p) => {
    const v = p?.Areas;
    if (Array.isArray(v)) return v;
    try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; }
};

// Título da vaga para o email: usa o título real; se for genérico ("Vaga"/vazio),
// deriva da ÁREA do usuário → headline → padrão. Evita "Candidatura para Vaga".
function niceTitle(job, profile) {
    const raw = String(job.JobTitle || '').trim();
    if (raw && !/^vaga$/i.test(raw)) return raw;          // título real (mantém "... vaga de teste" do teste)
    const role = AREA_ROLE[parseAreas(profile)[0]];
    if (role) return role;
    const hl = String(profile?.Headline || '').trim();
    if (hl) return hl.slice(0, 60);
    return 'Desenvolvedor(a)';                            // padrão (plataforma é dev-focada)
}

/**
 * Monta o mapa de variáveis a partir do usuário/perfil/vaga.
 * Cada variável tem versões { html, text }.
 */
export function buildVars({ user, profile, job }) {
    const p = profile || {};
    const waDigits = onlyDigits(p.Whatsapp || p.Phone || '');
    const waLink = waDigits ? link(`https://wa.me/${waDigits}`, 'WhatsApp') : { html: '', text: '' };

    // Bloco de contato (somente campos preenchidos)
    const contactLinesHtml = [];
    const contactLinesText = [];
    const push = (html, text) => { if (text) { contactLinesHtml.push(html); contactLinesText.push(text); } };
    push(escapeHtml(user.Email), user.Email);
    if (p.Phone) push(escapeHtml(p.Phone), p.Phone);
    const li = link(p.Linkedin, 'LinkedIn');
    const gh = link(p.Github, 'GitHub');
    const pf = link(p.Portfolio, 'Portfólio');
    if (li.text) push(li.html, li.text);
    if (gh.text) push(gh.html, gh.text);
    if (pf.text) push(pf.html, pf.text);

    return {
        job_title: value(niceTitle(job, p)),
        company: value(job.Company || 'a empresa'),
        sender_name: value(user.Name),
        whatsapp_link: waLink,
        linkedin_link: li,
        github_link: gh,
        portfolio: pf,
        contact_info: {
            html: contactLinesHtml.join('<br>'),
            text: contactLinesText.join('\n'),
        },
    };
}

function replaceAll(str, token, val) {
    return str.split(token).join(val);
}

// Markdown simples (texto JÁ escapado): **negrito** e *itálico*
function mdInline(s) {
    return s
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
}

/** Renderiza um texto com as variáveis, em HTML e em texto puro. */
export function render(template, vars, { paragraphs = false } = {}) {
    let html = mdInline(escapeHtml(template));
    let text = template;
    for (const [key, v] of Object.entries(vars)) {
        const token = `{${key}}`;
        html = replaceAll(html, token, v.html);
        text = replaceAll(text, token, v.text);
    }

    if (paragraphs) {
        // \n\n+ vira parágrafo (espaçamento sutil); \n simples vira quebra de linha
        html = html
            .split(/\n{2,}/)
            .map((p) => `<p style="margin:0 0 14px;">${p.replace(/\n/g, '<br>')}</p>`)
            .join('');
    } else {
        html = html.replace(/\n/g, '<br>\n');
    }
    // texto puro: remove marcadores de markdown
    text = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
    return { html, text };
}

/**
 * Renderiza assunto + corpo completos.
 * Retorna { subject, html, text }.
 */
export function renderEmail({ subjectTemplate, bodyTemplate, user, profile, job }) {
    const vars = buildVars({ user, profile, job });
    const subject = render(subjectTemplate, vars).text.replace(/\s+/g, ' ').trim();
    const { html, text } = render(bodyTemplate, vars, { paragraphs: true });
    return {
        subject,
        text,
        html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#111;">${html}</div>`,
    };
}
