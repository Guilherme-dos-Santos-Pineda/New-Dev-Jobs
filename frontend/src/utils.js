export function scoreClass(score) {
    if (score >= 75) return 'high';
    if (score >= 50) return 'mid';
    return 'low';
}

export function fmtDate(value) {
    if (!value) return '';
    // SQLite retorna "YYYY-MM-DD HH:MM:SS" (UTC) — normaliza para ISO
    const iso = value.includes('T') ? value : value.replace(' ', 'T') + 'Z';
    const d = new Date(iso);
    if (isNaN(d)) return value;
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

export const SENIORITY_OPTIONS = [
    { value: 'estagio', label: 'Estágio' },
    { value: 'junior', label: 'Júnior' },
    { value: 'pleno', label: 'Pleno' },
    { value: 'senior', label: 'Sênior' },
    { value: 'especialista', label: 'Especialista' },
];

export const MODALITY_OPTIONS = [
    { value: 'remoto', label: 'Remoto' },
    { value: 'hibrido', label: 'Híbrido' },
    { value: 'presencial', label: 'Presencial' },
];

export const LEVEL_OPTIONS = [
    { value: 'estagio', label: 'Estágio' },
    { value: 'junior', label: 'Júnior' },
    { value: 'pleno', label: 'Pleno' },
    { value: 'senior', label: 'Sênior' },
    { value: 'lead', label: 'Lead / Tech Lead' },
    { value: 'manager', label: 'Manager' },
];

// ---- Máscaras de telefone ----
export function maskPhone(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (!d) return '';
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskWhatsapp(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 13);
    if (!d) return '';
    const cc = d.slice(0, 2), area = d.slice(2, 4), n = d.slice(4);
    let out = `+${cc}`;
    if (area) out += ` (${area}${area.length === 2 ? ')' : ''}`;
    if (n) out += ` ${n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n}`;
    return out;
}

export function normalizeLinkedin(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    if (/^https?:\/\//i.test(s)) return s;
    if (/linkedin\.com/i.test(s)) return `https://${s.replace(/^\/+/, '')}`;
    return `https://www.linkedin.com/in/${s.replace(/^@/, '').replace(/^\/+/, '')}`;
}

// ---- Normalização de keywords (espelha o backend) ----
const TECH_CANON = {
    js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
    node: 'Node.js', nodejs: 'Node.js', 'node.js': 'Node.js', '.net': '.NET', dotnet: '.NET',
    net: '.NET', 'asp.net': 'ASP.NET', aspnet: 'ASP.NET', 'c#': 'C#', csharp: 'C#', 'c++': 'C++',
    cpp: 'C++', react: 'React', reactjs: 'React', 'react.js': 'React', 'react native': 'React Native',
    next: 'Next.js', nextjs: 'Next.js', 'next.js': 'Next.js', vue: 'Vue', vuejs: 'Vue', angular: 'Angular',
    python: 'Python', py: 'Python', java: 'Java', kotlin: 'Kotlin', swift: 'Swift', flutter: 'Flutter',
    go: 'Go', golang: 'Go', rust: 'Rust', php: 'PHP', laravel: 'Laravel', sql: 'SQL', mysql: 'MySQL',
    postgres: 'PostgreSQL', postgresql: 'PostgreSQL', sqlserver: 'SQL Server', 'sql server': 'SQL Server',
    mongo: 'MongoDB', mongodb: 'MongoDB', redis: 'Redis', firebase: 'Firebase', aws: 'AWS', azure: 'Azure',
    gcp: 'GCP', docker: 'Docker', kubernetes: 'Kubernetes', k8s: 'Kubernetes', git: 'Git', github: 'GitHub',
    gitlab: 'GitLab', jenkins: 'Jenkins', html: 'HTML', css: 'CSS', sass: 'SASS', tailwind: 'Tailwind',
    bootstrap: 'Bootstrap', jquery: 'jQuery', rest: 'REST', graphql: 'GraphQL', api: 'API', spring: 'Spring',
    lit: 'Lit', electron: 'Electron', solr: 'Solr', 'entity framework': 'Entity Framework',
};

export function normalizeKeyword(raw) {
    let s = String(raw || '')
        .replace(/[^\p{L}\p{N}+#./_\- ]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
    if (!s) return '';
    return TECH_CANON[s.toLowerCase()] || s;
}
