import 'dotenv/config';
import sql from '../lib/sql.js';

// =========================================================================
// Gera robôs de monitoramento por (stack × nível × região), com queries NATURAIS
// no padrão dos posts reais. contentType "all" (tag de vaga OFF). Também cria
// robôs "saved" que verificam os posts dos recrutadores já cadastrados.
//
//   node backend/scripts/seed-robots.mjs                    # SIMULA (contagem + custo)
//   node backend/scripts/seed-robots.mjs --commit           # cria/ATUALIZA (idempotente por Nome)
//   node backend/scripts/seed-robots.mjs --commit --reset   # APAGA todos antes e recria do zero
//   flags: --br-only | --global-only | --maxPosts=99 | --interval=1440 | --queries=2 | --inactive
// =========================================================================

const arg = (k, def) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : def; };
const has = (k) => process.argv.includes(`--${k}`);
const COMMIT = has('commit');
const RESET = has('reset');
const ACTIVE = !has('inactive');
const MAX_POSTS = Math.min(100, Number(arg('maxPosts', 99)) || 99);
const INTERVAL = Number(arg('interval', 1440)) || 1440;
const QPR = Math.max(1, Math.min(5, Number(arg('queries', 2)) || 2)); // queries por robô (1-5)
const REGIONS = has('br-only') ? ['br'] : has('global-only') ? ['global'] : ['br', 'global'];

// Stacks: q = cargo natural PT, qEn = EN.
const STACKS = [
    { label: '.NET', q: 'Desenvolvedor .NET', qEn: '.NET Developer' },
    { label: 'C#', q: 'Desenvolvedor C#', qEn: 'C# Developer' },
    { label: 'Java', q: 'Desenvolvedor Java', qEn: 'Java Developer' },
    { label: 'Spring', q: 'Desenvolvedor Java Spring', qEn: 'Java Spring Developer' },
    { label: 'Node.js', q: 'Desenvolvedor Node.js', qEn: 'Node.js Developer' },
    { label: 'React', q: 'Desenvolvedor React', qEn: 'React Developer' },
    { label: 'Angular', q: 'Desenvolvedor Angular', qEn: 'Angular Developer' },
    { label: 'Vue', q: 'Desenvolvedor Vue.js', qEn: 'Vue.js Developer' },
    { label: 'TypeScript', q: 'Desenvolvedor TypeScript', qEn: 'TypeScript Developer' },
    { label: 'Python', q: 'Desenvolvedor Python', qEn: 'Python Developer' },
    { label: 'Django', q: 'Desenvolvedor Python Django', qEn: 'Django Developer' },
    { label: 'PHP', q: 'Desenvolvedor PHP', qEn: 'PHP Developer' },
    { label: 'Laravel', q: 'Desenvolvedor PHP Laravel', qEn: 'Laravel Developer' },
    { label: 'Go', q: 'Desenvolvedor Golang', qEn: 'Golang Developer' },
    { label: 'Ruby', q: 'Desenvolvedor Ruby on Rails', qEn: 'Ruby on Rails Developer' },
    { label: 'Rust', q: 'Desenvolvedor Rust', qEn: 'Rust Developer' },
    { label: 'C++', q: 'Desenvolvedor C++', qEn: 'C++ Developer' },
    { label: 'Kotlin', q: 'Desenvolvedor Kotlin', qEn: 'Kotlin Developer' },
    { label: 'Flutter', q: 'Desenvolvedor Flutter', qEn: 'Flutter Developer' },
    { label: 'iOS', q: 'Desenvolvedor iOS Swift', qEn: 'iOS Developer' },
    { label: 'Android', q: 'Desenvolvedor Android', qEn: 'Android Developer' },
    { label: 'React Native', q: 'Desenvolvedor React Native', qEn: 'React Native Developer' },
    { label: 'Frontend', q: 'Desenvolvedor Front-end', qEn: 'Frontend Developer' },
    { label: 'Backend', q: 'Desenvolvedor Back-end', qEn: 'Backend Developer' },
    { label: 'Fullstack', q: 'Desenvolvedor Full Stack', qEn: 'Full Stack Developer' },
    { label: 'Mobile', q: 'Desenvolvedor Mobile', qEn: 'Mobile Developer' },
    { label: 'Dados', q: 'Engenheiro de Dados', qEn: 'Data Engineer' },
    { label: 'Data Science', q: 'Cientista de Dados', qEn: 'Data Scientist' },
    { label: 'ML', q: 'Engenheiro de Machine Learning', qEn: 'Machine Learning Engineer' },
    { label: 'DevOps', q: 'Engenheiro DevOps', qEn: 'DevOps Engineer' },
    { label: 'Cloud', q: 'Engenheiro de Cloud AWS', qEn: 'AWS Cloud Engineer' },
    { label: 'SRE', q: 'Engenheiro SRE', qEn: 'Site Reliability Engineer' },
    { label: 'QA', q: 'Analista de QA', qEn: 'QA Engineer' },
    { label: 'Segurança', q: 'Analista de Segurança da Informação', qEn: 'Security Engineer' },
    { label: 'Salesforce', q: 'Desenvolvedor Salesforce', qEn: 'Salesforce Developer' },
    { label: 'SAP', q: 'Consultor SAP ABAP', qEn: 'SAP ABAP Consultant' },
];

// Níveis: pt = palavra natural (com acento), en = equivalente.
const LEVELS = [
    { label: 'Estágio', pt: 'Estágio', en: 'Intern' },
    { label: 'Júnior', pt: 'Júnior', en: 'Junior' },
    { label: 'Pleno', pt: 'Pleno', en: 'Mid-level' },
    { label: 'Sênior', pt: 'Sênior', en: 'Senior' },
];

// Padrões naturais de post (mais variações = mais cobertura). QPR escolhe quantos.
const TEMPLATES_PT = [
    (role, lv) => `Estamos contratando ${role} ${lv}`,
    (role, lv) => `Vaga ${role} ${lv}`,
    (role, lv) => `Procuramos ${role} ${lv}`,
    (role, lv) => `Oportunidade para ${role} ${lv}`,
    (role, lv) => `Buscamos ${role} ${lv}`,
];
const TEMPLATES_EN = [
    (role, lv) => `Hiring ${role} ${lv}`,
    (role, lv) => `We are hiring ${role} ${lv}`,
    (role, lv) => `Looking for ${role} ${lv}`,
    (role, lv) => `Join us as ${role} ${lv}`,
    (role, lv) => `We're hiring a ${lv} ${role}`,
];

function queriesFor(stack, level, region) {
    const tpls = (region === 'br' ? TEMPLATES_PT : TEMPLATES_EN).slice(0, QPR);
    return tpls.map((t) => (region === 'br' ? t(stack.q, level.pt) : t(stack.qEn, level.en)));
}

function buildRobots() {
    const robots = [];
    for (const stack of STACKS) {
        for (const level of LEVELS) {
            for (const region of REGIONS) {
                robots.push({
                    name: `${stack.label} · ${level.label} · ${region === 'br' ? 'BR' : 'Global'}`.slice(0, 80),
                    type: 'monitoring', intervalMinutes: INTERVAL,
                    params: {
                        source: 'global', region, queries: queriesFor(stack, level, region),
                        contentType: 'all', maxPosts: MAX_POSTS, scrapePages: 2,
                        postedLimit: region === 'br' ? 'month' : 'week', sortBy: 'date',
                    },
                });
            }
        }
    }
    for (const region of REGIONS) {
        robots.push({
            name: `Recrutadores salvos · ${region === 'br' ? 'BR' : 'Global'}`.slice(0, 80),
            type: 'monitoring', intervalMinutes: 360,
            params: {
                source: 'saved', region, maxRecruiters: 10,
                queries: region === 'br' ? ['Estamos contratando', 'Vaga Desenvolvedor'] : ['We are hiring', 'Hiring Developer'],
                contentType: 'all', maxPosts: MAX_POSTS, scrapePages: 2, sortBy: 'date',
            },
        });
    }
    return robots;
}

(async () => {
    const robots = buildRobots();
    const postsPerCycle = robots.length * MAX_POSTS;
    const estUsd = (postsPerCycle * 0.002).toFixed(2);
    console.log(`Gerados ${robots.length} robôs (stacks=${STACKS.length} × níveis=${LEVELS.length} × regiões=${REGIONS.join('+')} + saved).`);
    console.log(`Cada robô: ${QPR} query(ies), contentType=all, maxPosts=${MAX_POSTS}, ${ACTIVE ? 'ATIVO' : 'pausado'}.${RESET ? ' [--reset: apaga os existentes antes]' : ''}`);
    console.log(`⚠️  Por ciclo: ~${postsPerCycle} posts ≈ US$${estUsd} de Apify (estimativa).`);
    robots.slice(0, 3).forEach((r) => console.log(`  • ${r.name} → ${r.params.queries.join('  |  ')}`));

    if (!COMMIT) {
        console.log('\n(SIMULAÇÃO) Nada criado. Para criar: --commit  (limpar antes: --reset · dicas: --br-only --maxPosts=40)');
        process.exit(0);
    }
    if (!sql) { console.error('DATABASE_URL ausente no .env'); process.exit(1); }
    if (RESET) {
        const del = await sql`delete from "ScraperSchedules" returning "Id"`;
        console.log(`🧹 ${del.length} robô(s) existente(s) apagado(s).`);
    }
    let created = 0, updated = 0;
    for (const r of robots) {
        const [exists] = await sql`select "Id" from "ScraperSchedules" where "Name" = ${r.name}`;
        if (exists) {
            await sql`
                update "ScraperSchedules"
                set "Type" = ${r.type}, "Params" = ${sql.json(r.params)}, "IntervalMinutes" = ${r.intervalMinutes},
                    "Active" = ${ACTIVE}, "UpdatedAt" = now()
                where "Id" = ${exists.Id}`;
            updated += 1;
        } else {
            await sql`
                insert into "ScraperSchedules" ("Name", "Type", "Params", "IntervalMinutes", "Active", "NextRunAt")
                values (${r.name}, ${r.type}, ${sql.json(r.params)}, ${r.intervalMinutes}, ${ACTIVE}, now())`;
            created += 1;
        }
    }
    console.log(`\n✅ ${created} criado(s), ${updated} atualizado(s). ${ACTIVE ? 'Disparam no próximo ciclo (≤1 min).' : 'Pausados.'}`);
    await sql.end();
    process.exit(0);
})().catch((e) => { console.error('❌ Falha:', e.message); process.exit(1); });
