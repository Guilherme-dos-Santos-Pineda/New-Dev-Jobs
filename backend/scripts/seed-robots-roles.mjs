import 'dotenv/config';
import sql from '../lib/sql.js';

// =========================================================================
// Robôs por PERFIL (suporte, QA, dev), pensados nos usuários reais: suporte e QA
// estão descobertos no banco; dev júnior reforça quem não tem skills/área.
//   10 robôs PT + 5 EN. Queries naturais (padrão dos posts reais).
//
//   node backend/scripts/seed-robots-roles.mjs                 # SIMULA (contagem + custo)
//   node backend/scripts/seed-robots-roles.mjs --commit        # cria/atualiza (idempotente por Nome)
//   node backend/scripts/seed-robots-roles.mjs --commit --inactive   # cria PAUSADO (sem gastar Apify)
//   flags: --maxPosts=40 | --interval=1440
// =========================================================================

const arg = (k, def) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : def; };
const has = (k) => process.argv.includes(`--${k}`);
const COMMIT = has('commit');
const ACTIVE = !has('inactive');
const MAX_POSTS = Math.min(100, Number(arg('maxPosts', 40)) || 40);
const INTERVAL = Number(arg('interval', 1440)) || 1440;

// Cada robô: nome, região (br=PT, global=EN) e as queries naturais.
const DEFS = [
    // ---------- SUPORTE (descoberto no banco) ----------
    { name: 'Suporte · Analista N1/N2 · BR', region: 'br', q: ['Vaga para Analista de Suporte', 'Estamos contratando Suporte Técnico N1', 'Oportunidade para Analista de Suporte N2'] },
    { name: 'Suporte · Help Desk · BR', region: 'br', q: ['Vaga para Help Desk', 'Estamos contratando Analista de Help Desk', 'Buscamos Suporte Help Desk'] },
    { name: 'Suporte · Service Desk · BR', region: 'br', q: ['Vaga para Service Desk', 'Estamos contratando Analista de Service Desk', 'Oportunidade para Service Desk'] },
    { name: 'Suporte · Sistemas / TI · BR', region: 'br', q: ['Vaga para Analista de Suporte de Sistemas', 'Estamos contratando Suporte de TI', 'Técnico de Suporte'] },
    // ---------- QA (só 1/40 no banco) ----------
    { name: 'QA · Analista de Qualidade · BR', region: 'br', q: ['Vaga para Analista de QA', 'Estamos contratando Analista de Qualidade', 'Oportunidade para QA'] },
    { name: 'QA · Analista de Testes · BR', region: 'br', q: ['Vaga para Analista de Testes', 'Estamos contratando Analista de Testes de Software', 'Buscamos Analista de Testes'] },
    { name: 'QA · Automação / SDET · BR', region: 'br', q: ['Vaga para Engenheiro de Automação de Testes', 'Estamos contratando QA Automation', 'Oportunidade para SDET'] },
    // ---------- DEV (reforço júnior) ----------
    { name: 'Dev · Júnior generalista · BR', region: 'br', q: ['Vaga para Desenvolvedor Júnior', 'Estamos contratando Programador Júnior', 'Oportunidade para Desenvolvedor Júnior'] },
    { name: 'Dev · Backend Júnior · BR', region: 'br', q: ['Vaga para Desenvolvedor Backend Júnior', 'Estamos contratando Desenvolvedor Backend Júnior', 'Buscamos Backend Júnior'] },
    { name: 'Dev · Fullstack · BR', region: 'br', q: ['Vaga para Desenvolvedor Fullstack', 'Estamos contratando Desenvolvedor Full Stack', 'Oportunidade para Desenvolvedor Fullstack'] },
    // ---------- EN (5): suporte, QA, dev ----------
    { name: 'Support · IT / Help Desk · Global', region: 'global', q: ['Hiring IT Support', 'We are hiring Help Desk Analyst', 'Looking for IT Support Analyst'] },
    { name: 'Support · Service Desk · Global', region: 'global', q: ['Hiring Service Desk Analyst', 'Looking for Technical Support Analyst', 'We are hiring Support Analyst'] },
    { name: 'QA · Engineer / SDET · Global', region: 'global', q: ['Hiring QA Engineer', 'Looking for SDET', 'We are hiring QA Automation Engineer'] },
    { name: 'QA · Test Automation · Global', region: 'global', q: ['Hiring Test Automation Engineer', 'Looking for QA Analyst', 'We are hiring Automation Tester'] },
    { name: 'Dev · Junior / Backend · Global', region: 'global', q: ['Hiring Junior Developer', 'Looking for Backend Developer', 'We are hiring Junior Software Engineer'] },
];

function build() {
    return DEFS.map((d) => ({
        name: d.name.slice(0, 80),
        type: 'monitoring', intervalMinutes: INTERVAL,
        params: {
            source: 'global', region: d.region, queries: d.q,
            contentType: 'all', maxPosts: MAX_POSTS, scrapePages: 2,
            postedLimit: d.region === 'br' ? 'month' : 'week', sortBy: 'date',
        },
    }));
}

(async () => {
    const robots = build();
    const pt = robots.filter((r) => r.params.region === 'br').length;
    const estUsd = (robots.length * MAX_POSTS * 0.002).toFixed(2);
    console.log(`Gerados ${robots.length} robôs por perfil (${pt} PT + ${robots.length - pt} EN): suporte, QA e dev.`);
    console.log(`Cada robô: maxPosts=${MAX_POSTS}, intervalo=${INTERVAL}min, ${ACTIVE ? 'ATIVO' : 'PAUSADO'}.`);
    console.log(`⚠️  Por ciclo: ~${robots.length * MAX_POSTS} posts ≈ US$${estUsd} de Apify (estimativa).`);
    robots.forEach((r) => console.log(`  • ${r.name}\n      ${r.params.queries.join('  |  ')}`));

    if (!COMMIT) {
        console.log('\n(SIMULAÇÃO) Nada criado. Criar: --commit  ·  criar pausado (sem gastar): --commit --inactive');
        process.exit(0);
    }
    if (!sql) { console.error('DATABASE_URL ausente no .env'); process.exit(1); }
    let created = 0, updated = 0;
    for (const r of robots) {
        const [exists] = await sql`select "Id" from "ScraperSchedules" where "Name" = ${r.name}`;
        if (exists) {
            await sql`update "ScraperSchedules" set "Type"=${r.type}, "Params"=${sql.json(r.params)}, "IntervalMinutes"=${r.intervalMinutes}, "Active"=${ACTIVE}, "UpdatedAt"=now() where "Id"=${exists.Id}`;
            updated += 1;
        } else {
            await sql`insert into "ScraperSchedules" ("Name", "Type", "Params", "IntervalMinutes", "Active", "NextRunAt") values (${r.name}, ${r.type}, ${sql.json(r.params)}, ${r.intervalMinutes}, ${ACTIVE}, now())`;
            created += 1;
        }
    }
    console.log(`\n✅ ${created} criado(s), ${updated} atualizado(s). ${ACTIVE ? 'Disparam no próximo ciclo (≤1 min).' : 'Criados PAUSADOS — ative no admin quando quiser.'}`);
    await sql.end();
    process.exit(0);
})().catch((e) => { console.error('❌ Falha:', e.message); process.exit(1); });
