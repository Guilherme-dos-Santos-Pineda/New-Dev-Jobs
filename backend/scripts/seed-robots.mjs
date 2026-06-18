import 'dotenv/config';
import sql from '../lib/sql.js';

// =========================================================================
// Gera robôs de monitoramento GRANULARES: um robô por (stack × nível × região),
// com queries específicas — variações com/sem acento, com/sem abreviação, PT/EN.
//
//   node backend/scripts/seed-robots.mjs            # SIMULA (mostra contagem + custo)
//   node backend/scripts/seed-robots.mjs --commit   # cria de verdade (idempotente por Nome)
//   flags: --br-only | --global-only | --maxPosts=99 | --interval=1440 | --inactive
//
// ⚠️ CUSTO: cada robô raspa até maxPosts posts por ciclo no Apify. Muitos robôs ×
//    99 posts custa MUITO. O script imprime a estimativa — confira o saldo antes.
//    Pause/edite/exclua qualquer robô na aba Admin → Bots.
// =========================================================================

const arg = (k, def) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : def; };
const has = (k) => process.argv.includes(`--${k}`);
const COMMIT = has('commit');
const ACTIVE = !has('inactive');
const MAX_POSTS = Math.min(100, Number(arg('maxPosts', 99)) || 99);
const INTERVAL = Number(arg('interval', 1440)) || 1440; // default 1x/dia p/ conter custo
const REGIONS = has('br-only') ? ['br'] : has('global-only') ? ['global'] : ['br', 'global'];
const MAX_QUERIES = 12; // teto por robô (schema admite 20)

// Stacks: cada uma com seus termos (nome + abreviações/variações).
const STACKS = [
    { key: 'dotnet', label: '.NET', terms: ['.net', 'c#', 'asp.net'] },
    { key: 'java', label: 'Java', terms: ['java', 'spring boot'] },
    { key: 'node', label: 'Node', terms: ['node', 'node.js', 'nodejs'] },
    { key: 'react', label: 'React', terms: ['react', 'reactjs'] },
    { key: 'angular', label: 'Angular', terms: ['angular'] },
    { key: 'vue', label: 'Vue', terms: ['vue', 'vue.js'] },
    { key: 'python', label: 'Python', terms: ['python', 'django'] },
    { key: 'php', label: 'PHP', terms: ['php', 'laravel'] },
    { key: 'go', label: 'Go', terms: ['golang', 'go developer'] },
    { key: 'flutter', label: 'Flutter', terms: ['flutter'] },
    { key: 'react-native', label: 'React Native', terms: ['react native'] },
    { key: 'data', label: 'Dados', terms: ['data engineer', 'engenheiro de dados'] },
    { key: 'devops', label: 'DevOps', terms: ['devops', 'sre'] },
    { key: 'qa', label: 'QA', terms: ['qa', 'quality assurance'] },
];

// Níveis: variações PT (com/sem acento + abreviação) e EN.
const LEVELS = [
    { key: 'estagio', label: 'Estágio', pt: ['estágio', 'estagio', 'estagiário', 'estagiario'], en: ['intern', 'internship'] },
    { key: 'junior', label: 'Júnior', pt: ['júnior', 'junior', 'jr'], en: ['junior', 'jr'] },
    { key: 'pleno', label: 'Pleno', pt: ['pleno', 'pl'], en: ['mid-level', 'mid'] },
    { key: 'senior', label: 'Sênior', pt: ['sênior', 'senior', 'sr'], en: ['senior', 'sr'] },
];

const BASE_PT = ['vaga', 'contratando'];
const BASE_EN = ['hiring'];

const uniqCap = (arr) => [...new Set(arr)].slice(0, MAX_QUERIES);

function queriesFor(stack, level, region) {
    const out = [];
    if (region === 'br') {
        for (const base of BASE_PT) for (const st of stack.terms) for (const lv of level.pt) out.push(`"${base} ${st} ${lv}"`);
    } else {
        for (const base of BASE_EN) for (const st of stack.terms) for (const lv of level.en) out.push(`"${base} ${st} developer ${lv}"`);
    }
    return uniqCap(out);
}

function buildRobots() {
    const robots = [];
    for (const stack of STACKS) {
        for (const level of LEVELS) {
            for (const region of REGIONS) {
                const queries = queriesFor(stack, level, region);
                if (!queries.length) continue;
                robots.push({
                    name: `${stack.label} · ${level.label} · ${region === 'br' ? 'BR' : 'Global'}`.slice(0, 80),
                    type: 'monitoring',
                    intervalMinutes: INTERVAL,
                    params: {
                        source: 'global', region, queries, contentType: 'jobs',
                        maxPosts: MAX_POSTS, scrapePages: 2,
                        postedLimit: region === 'br' ? 'month' : 'week', sortBy: 'date',
                    },
                });
            }
        }
    }
    return robots;
}

(async () => {
    const robots = buildRobots();
    const postsPerCycle = robots.length * MAX_POSTS;
    const estUsd = (postsPerCycle * 0.002).toFixed(2); // ~US$0.002/post (estimativa grosseira)
    console.log(`Gerados ${robots.length} robôs (stacks=${STACKS.length} × níveis=${LEVELS.length} × regiões=${REGIONS.join('+')}).`);
    console.log(`Cada robô: maxPosts=${MAX_POSTS}, a cada ${INTERVAL}min, ${ACTIVE ? 'ATIVO' : 'pausado'}.`);
    console.log(`⚠️  Por ciclo: ~${postsPerCycle} posts raspados ≈ US$${estUsd} de Apify (estimativa).`);
    console.log('Exemplos:');
    robots.slice(0, 3).forEach((r) => console.log(`  • ${r.name}: ${r.params.queries.slice(0, 3).join('  ')} …`));

    if (!COMMIT) {
        console.log('\n(SIMULAÇÃO) Nada foi criado. Para criar de verdade: adicione --commit');
        console.log('Dicas p/ caber no saldo: --br-only, --interval=2880 (2 dias), --maxPosts=40, ou edite STACKS/LEVELS.');
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
    console.log(`\n✅ ${created} robô(s) criado(s), ${skipped} já existiam. ${ACTIVE ? 'Disparam no próximo ciclo do worker (≤1 min).' : 'Criados pausados — ative na aba Bots.'}`);
    await sql.end();
    process.exit(0);
})().catch((e) => { console.error('❌ Falha:', e.message); process.exit(1); });
