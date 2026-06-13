// =========================
// Parser heurístico do PDF "Salvar como PDF" do LinkedIn
// =========================
// O export do LinkedIn segue um layout previsível:
//   Contato
//   <email (às vezes quebrado em 2 linhas)>
//   <url linkedin (quebrada)> (LinkedIn)
//   <url portfolio> (Portfolio)
//   Principais competências
//   <skill>
//   ...
//   <Nome>
//   <Headline>
//   <Localização>
//   Resumo
//   ...

const KNOWN_TECH = [
    '.NET', 'ASP.NET', 'C#', 'Entity Framework', 'Node.js', 'Node', 'Deno', 'JavaScript',
    'TypeScript', 'React', 'React Native', 'Next.js', 'Angular', 'Vue', 'Svelte', 'Lit',
    'jQuery', 'Bootstrap', 'Tailwind', 'HTML', 'CSS', 'SASS', 'Java', 'Spring', 'Kotlin',
    'Swift', 'Flutter', 'Dart', 'Python', 'Django', 'Flask', 'FastAPI', 'Go', 'Golang',
    'Rust', 'PHP', 'Laravel', 'Ruby', 'Rails', 'C++', 'C', 'MySQL', 'PostgreSQL',
    'SQL Server', 'SQL', 'MongoDB', 'Redis', 'Firebase', 'Solr', 'Elasticsearch',
    'GraphQL', 'REST', 'gRPC', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab', 'GitHub',
    'Git', 'CI/CD', 'AWS', 'Azure', 'GCP', 'Terraform', 'RabbitMQ', 'Kafka', 'Electron',
    'Cordova', 'Scrum', 'Kanban', 'Microservices', 'Microserviços',
];

const SECTION_HEADINGS = [
    'contato', 'contact', 'principais competências', 'top skills', 'competências',
    'certifications', 'certificações', 'languages', 'idiomas', 'summary', 'resumo',
    'experiência', 'experience', 'formação acadêmica', 'education', 'honors', 'awards',
];

function isHeading(line) {
    const l = line.trim().toLowerCase();
    return SECTION_HEADINGS.includes(l);
}

function normalizeUrl(url) {
    if (!url) return null;
    let u = url.trim().replace(/\s+/g, '');
    if (!u) return null;
    return /^https?:\/\//i.test(u) ? u : `https://${u}`;
}

function seniorityFromText(text = '') {
    const t = text.toLowerCase();
    if (/especialista|specialist|staff|principal/.test(t)) return 'especialista';
    if (/s[êe]nior|senior|\bsr\b/.test(t)) return 'senior';
    if (/pleno|\bpl\b|mid[-\s]?level/.test(t)) return 'pleno';
    if (/j[úu]nior|junior|\bjr\b/.test(t)) return 'junior';
    if (/est[áa]gi|intern|trainee/.test(t)) return 'estagio';
    return null;
}

// Uma linha "não terminou" e continua na próxima (URL ou email quebrados)
function needsContinuation(line) {
    if (/\)\s*$/.test(line)) return false;            // terminou com rótulo "(...)"
    if (/\/$/.test(line)) return true;                // URL quebrada (termina em "/")
    if (/@[^.\s]+$/.test(line)) return true;          // email sem TLD ("...@gmail")
    if (/^(www\.|https?:\/\/)/i.test(line) && !/\)\s*$/.test(line) && !/\.[a-z]{2,}(\/\S*)?$/i.test(line)) return true;
    return false;
}

function parseContactBlock(block) {
    const out = { email: null, phone: null, linkedin: null, github: null, portfolio: null };

    for (let i = 0; i < block.length; i++) {
        let line = block[i];
        // junta continuações (URL/email quebrados em várias linhas)
        let guard = 0;
        while (i + 1 < block.length && needsContinuation(line) && guard++ < 4) {
            line = line + block[i + 1];
            i++;
        }
        const labelMatch = line.match(/\(([^)]+)\)\s*$/);
        const label = labelMatch ? labelMatch[1].toLowerCase() : '';
        const cleaned = line.replace(/\s*\([^)]*\)\s*$/, '').trim();

        if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(cleaned)) {
            out.email = cleaned.replace(/\s+/g, '');
        } else if (/linkedin\.com/i.test(cleaned) || /linkedin/.test(label)) {
            out.linkedin = normalizeUrl(cleaned);
        } else if (/github\.com/i.test(cleaned)) {
            out.github = normalizeUrl(cleaned);
        } else if (/portf|site|personal|pessoal/.test(label)) {
            out.portfolio = normalizeUrl(cleaned);
        } else if (/^\+?[\d][\d\s().-]{7,}\d$/.test(cleaned)) {
            out.phone = cleaned;
        }
    }
    return out;
}

function extractSkills(lines, full) {
    const result = [];
    const seen = new Set();
    const add = (s) => {
        const key = s.trim().toLowerCase();
        if (key && !seen.has(key)) { seen.add(key); result.push(s.trim()); }
    };

    // 1) bloco explícito "Principais competências" / "Top Skills"
    const idx = lines.findIndex((l) => /^(principais competências|top skills|compet[êe]ncias)$/i.test(l.trim()));
    if (idx >= 0) {
        for (let i = idx + 1; i < lines.length && i < idx + 12; i++) {
            if (isHeading(lines[i])) break;
            // linhas de skill são curtas; ignora frases longas
            if (lines[i].length <= 40 && !/[.;:]/.test(lines[i])) add(lines[i]);
            else break;
        }
    }

    // 2) varredura por stack conhecida no texto inteiro
    for (const tech of KNOWN_TECH) {
        const escaped = tech.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`(^|[^\\w.#+])${escaped}([^\\w.#+]|$)`, 'i');
        if (re.test(full)) add(tech);
    }

    return result.slice(0, 25);
}

export function parseLinkedInText(text = '') {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);

    // ---- Contato ----
    const cStart = lines.findIndex((l) => /^(contato|contact)$/i.test(l));
    let contact = { email: null, phone: null, linkedin: null, github: null, portfolio: null };
    if (cStart >= 0) {
        let cEnd = lines.findIndex((l, i) => i > cStart && isHeading(l));
        if (cEnd < 0) cEnd = Math.min(lines.length, cStart + 12);
        contact = parseContactBlock(lines.slice(cStart + 1, cEnd));
    }
    // fallback: email em qualquer lugar
    if (!contact.email) {
        const m = text.replace(/\n/g, '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
        if (m) contact.email = m[0];
    }

    // ---- Nome / Headline / Localização (antes de "Resumo"/"Summary") ----
    let name = null, headline = null, location = null;
    const rIdx = lines.findIndex((l) => /^(resumo|summary)$/i.test(l));
    if (rIdx >= 3) {
        location = lines[rIdx - 1];
        headline = lines[rIdx - 2];
        name = lines[rIdx - 3];
    }

    // ---- Senioridade ----
    const seniority = seniorityFromText(headline || '') || seniorityFromText(text);

    // ---- Skills ----
    const skills = extractSkills(lines, text);

    return {
        name: name || null,
        headline: headline || null,
        location: location || null,
        seniority: seniority || null,
        skills,
        ...contact,
    };
}
