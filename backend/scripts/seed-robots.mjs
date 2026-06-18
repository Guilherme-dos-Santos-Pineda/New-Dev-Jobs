import 'dotenv/config';
import sql from '../lib/sql.js';

// =========================================================================
// Gera robôs de monitoramento por (stack × nível × região), com 1-2 queries
// NATURAIS no padrão dos posts reais (ex.: "Estamos contratando Desenvolvedor PHP
// Pleno") — sem permutações artificiais. contentType "all" (tag de vaga DESLIGADA).
// Também cria robôs "saved" que verificam os posts dos recrutadores já cadastrados.
//
//   node backend/scripts/seed-robots.mjs            # SIMULA (contagem + custo)
//   node backend/scripts/seed-robots.mjs --commit   # cria de verdade (idempotente por Nome)
//   flags: --br-only | --global-only | --maxPosts=99 | --interval=1440 | --queries=2 | --inactive
// =========================================================================

const arg = (k, def) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : def; };
const has = (k) => process.argv.includes(`--${k}`);
const COMMIT = has('commit');
const ACTIVE = !has('inactive');
const MAX_POSTS = Math.min(100, Number(arg('maxPosts', 99)) || 99);
const INTERVAL = Number(arg('interval', 1440)) || 1440;
const QPR = Math.max(1, Math.min(2, Number(arg('queries', 2)) || 2)); // queries por robô (1-2)
const REGIONS = has('br-only') ? ['br'] : has('global-only') ? ['global'] : ['br', 'global'];

// Stacks: q = frase natural PT (cargo), qEn = EN.
const STACKS = [
    { label: '.NET', q: 'Desenvolvedor .NET', qEn: '.NET Developer' },
    { label: 'Java', q: 'Desenvolvedor Java', qEn: 'Java Developer' },
    { label: 'Node.js', q: 'Desenvolvedor Node.js', qEn: 'Node.js Developer' },
    { label: 'React', q: 'Desenvolvedor React', qEn: 'React Developer' },
    { label: 'Angular', q: 'Desenvolvedor Angular', qEn: 'Angular Developer' },
    { label: 'Vue', q: 'Desenvolvedor Vue.js', qEn: 'Vue.js Developer' },
    { label: 'Python', q: 'Desenvolvedor Python', qEn: 'Python Developer' },
    { label: 'PHP', q: 'Desenvolvedor PHP', qEn: 'PHP Developer' },
    { label: 'Go', q: 'Desenvolvedor Golang', qEn: 'Golang Developer' },
    { label: 'Flutter', q: 'Desenvolvedor Flutter', qEn: 'Flutter Developer' },
    { label: 'React Native', q: 'Desenvolvedor React Native', qEn: 'React Native Developer' },
    { label: 'Dados', q: 'Engenheiro de Dados', qEn: 'Data Engineer' },
    { label: 'DevOps', q: 'Engenheiro DevOps', qEn: 'DevOps Engineer' },
    { label: 'QA', q: 'Analista de QA', qEn: 'QA Engineer' },
];

// Níveis: pt = palavra natural (com acento), en = equivalente.
const LEVELS = [
    { label: 'Estágio', pt: 'Estágio', en: 'Intern' },
    { label: 'Júnior', pt: 'Júnior', en: 'Junior' },
    { label: 'Pleno', pt: 'Pleno', en: 'Mid-level' },
    { label: 'Sênior', pt: 'Sênior', en: 'Senior' },
];

function queriesFor(stack, level, region) {
    const list = region === 'br'
        ? [`Estamos contratando ${stack.q} ${level.pt}`, `Vaga ${stack.q} ${level.pt}`]
        : [`Hiring ${stack.qEn} ${level.en}`, `We are hiring ${stack.qEn} ${level.en}`];
    return list.slice(0, QPR);
}

function buildRobots() {
    const robots = [];
    // 1) Busca global por stack × nível × região (queries naturais)
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
    // 2) "Outros bots": verificam os posts dos recrutadores já cadastrados (rotação)
    for (const region of REGIONS) {
        robots.push({
            name: `Recrutadores salvos · ${region === 'br' ? 'BR' : 'Global'}`.slice(0, 80),
            type: 'monitoring', intervalMinutes: 360, // roda mais vezes (rotaciona a base)
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
    console.log(`Cada robô: ${QPR} query(ies) naturais, contentType=all (tag vaga OFF), maxPosts=${MAX_POSTS}, ${ACTIVE ? 'ATIVO' : 'pausado'}.`);
    console.log(`⚠️  Por ciclo: ~${postsPerCycle} posts ≈ US$${estUsd} de Apify (estimativa).`);
    console.log('Exemplos de query:');
    robots.slice(0, 4).forEach((r) => console.log(`  • ${r.name} → ${r.params.queries.join('  |  ')}`));

    if (!COMMIT) {
        console.log('\n(SIMULAÇÃO) Nada criado. Para criar: --commit  (dicas: --br-only, --maxPosts=40, --interval=2880)');
        process.exit(0);
    }
    if (!sql) { console.error('DATABASE_URL ausente no .env'); process.exit(1); }
    let created = 0, skipped = 0;
    for (const r of robots) {
        const [exists] = await sql`select "Id" from "ScraperSchedules" where "Name" = ${r.name}`;
        if (exists) { skipped += 1; continue; }
        await sql`
            insert into "ScraperSchedules" ("Name", "Type", "Params", "IntervalMinutes", "Active", "NextRunAt")
            values (${r.name}, ${r.type}, ${sql.json(r.params)}, ${r.intervalMinutes}, ${ACTIVE}, now())`;
        created += 1;
    }
    console.log(`\n✅ ${created} criado(s), ${skipped} já existiam. ${ACTIVE ? 'Disparam no próximo ciclo (≤1 min).' : 'Criados pausados.'}`);
    await sql.end();
    process.exit(0);
})().catch((e) => { console.error('❌ Falha:', e.message); process.exit(1); });
