// =========================
// Normalização e sanitização de keywords
// =========================
// - Corrige variações conhecidas (.net -> .NET, js -> JavaScript)
// - Remove caracteres perigosos (evita injeção / lixo)

export const TECH_CANON = {
    js: 'JavaScript', javascript: 'JavaScript',
    ts: 'TypeScript', typescript: 'TypeScript',
    node: 'Node.js', nodejs: 'Node.js', 'node.js': 'Node.js',
    '.net': '.NET', dotnet: '.NET', net: '.NET', 'asp.net': 'ASP.NET', aspnet: 'ASP.NET',
    'c#': 'C#', csharp: 'C#', 'c++': 'C++', cpp: 'C++',
    react: 'React', reactjs: 'React', 'react.js': 'React',
    'react native': 'React Native', reactnative: 'React Native',
    next: 'Next.js', nextjs: 'Next.js', 'next.js': 'Next.js',
    vue: 'Vue', vuejs: 'Vue', angular: 'Angular', svelte: 'Svelte', lit: 'Lit',
    python: 'Python', py: 'Python', java: 'Java', kotlin: 'Kotlin', swift: 'Swift',
    flutter: 'Flutter', dart: 'Dart', go: 'Go', golang: 'Go', rust: 'Rust',
    php: 'PHP', laravel: 'Laravel', ruby: 'Ruby', rails: 'Rails',
    sql: 'SQL', mysql: 'MySQL', postgres: 'PostgreSQL', postgresql: 'PostgreSQL',
    sqlserver: 'SQL Server', 'sql server': 'SQL Server', mongo: 'MongoDB', mongodb: 'MongoDB',
    redis: 'Redis', firebase: 'Firebase', solr: 'Solr', elasticsearch: 'Elasticsearch',
    aws: 'AWS', azure: 'Azure', gcp: 'GCP', docker: 'Docker', kubernetes: 'Kubernetes', k8s: 'Kubernetes',
    git: 'Git', github: 'GitHub', gitlab: 'GitLab', jenkins: 'Jenkins', terraform: 'Terraform',
    html: 'HTML', css: 'CSS', sass: 'SASS', scss: 'SASS', tailwind: 'Tailwind',
    bootstrap: 'Bootstrap', jquery: 'jQuery', rest: 'REST', graphql: 'GraphQL', grpc: 'gRPC',
    api: 'API', spring: 'Spring', django: 'Django', flask: 'Flask', fastapi: 'FastAPI',
    electron: 'Electron', cordova: 'Cordova', 'entity framework': 'Entity Framework',
};

const MAX_LEN = 40;

/** Limpa e padroniza uma keyword/skill. Retorna '' se inválida. */
export function normalizeKeyword(raw) {
    if (raw == null) return '';
    // mantém letras (com acento), números, espaço e + # . - / _  (remove o resto)
    let s = String(raw)
        .replace(/[^\p{L}\p{N}+#./_\- ]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_LEN);
    if (!s) return '';
    const canon = TECH_CANON[s.toLowerCase()];
    return canon || s;
}

/** Normaliza um domínio de email (gmail.com). */
export function normalizeDomain(raw) {
    if (raw == null) return '';
    return String(raw).toLowerCase().trim()
        .replace(/^@+/, '')
        .replace(/[^a-z0-9.-]/g, '')
        .slice(0, 60);
}

/** Aplica um normalizador a uma lista, removendo vazios e duplicatas. */
export function normalizeList(arr, fn = normalizeKeyword) {
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const item of arr) {
        const v = fn(item);
        const key = v.toLowerCase();
        if (v && !seen.has(key)) { seen.add(key); out.push(v); }
    }
    return out;
}
