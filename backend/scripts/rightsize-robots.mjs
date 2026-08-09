import 'dotenv/config';
import sql from '../lib/sql.js';

// =========================================================================
// Redimensiona os robôs de coleta para caber no crédito Apify.
//
// Contexto: com 305 robôs diários o sistema tentava ~9.330 runs/mês, muito além
// do que as contas Apify gratuitas sustentam. Resultado real: 12.887 runs
// `failed` ("todas as contas sem crédito") contra 653 `done`, e nenhum run
// bem-sucedido desde 08/07/2026. Ver RECOVERY.md §4.
//
// Estratégia: manter os robôs de maior retorno (stacks principais do BR +
// "Recrutadores salvos", que monitoram quem já foi aprovado) e DESATIVAR o resto.
// Desativa, não apaga — dá para reverter com `--restore`.
//
//   node backend/scripts/rightsize-robots.mjs                 # SIMULA (padrão)
//   node backend/scripts/rightsize-robots.mjs --commit        # aplica
//   node backend/scripts/rightsize-robots.mjs --restore --commit   # reativa TODOS
//   flags: --stacks=Java,Python  --keep-global  --interval=2880  --no-stagger
// =========================================================================

const arg = (k, def) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : def; };
const has = (k) => process.argv.includes(`--${k}`);
const COMMIT = has('commit');
const RESTORE = has('restore');
const KEEP_GLOBAL = has('keep-global');
const STAGGER = !has('no-stagger');
const INTERVAL = Number(arg('interval', 0)) || 0; // 0 = não mexe no intervalo

// Stacks mantidas por padrão: as de maior volume de vaga no mercado BR.
const DEFAULT_STACKS = ['Java', 'Python', 'React', 'Node.js', 'TypeScript', 'Frontend', 'Backend', 'Fullstack', '.NET', 'QA'];
const STACKS = (arg('stacks', '') || '').trim()
    ? arg('stacks', '').split(',').map((s) => s.trim()).filter(Boolean)
    : DEFAULT_STACKS;

// Um robô é "salvos" quando monitora recrutadores já cadastrados — melhor
// sinal por crédito gasto, então fica independente da stack.
const isSaved = (name) => /^Recrutadores salvos|^Saved recruiters/i.test(name);
const regionOf = (name) => (/·\s*Global\s*$/i.test(name) ? 'global' : /·\s*BR\s*$/i.test(name) ? 'br' : '?');
const stackOf = (name) => String(name).split(' · ')[0].trim();

function shouldKeep(r) {
    if (r.Type !== 'monitoring') return false;              // discovery gasta muito mais crédito
    if (isSaved(r.Name)) return true;                        // sempre vale a pena
    const region = regionOf(r.Name);
    if (region === 'global' && !KEEP_GLOBAL) return false;   // foco BR (produto é pt-BR)
    return STACKS.includes(stackOf(r.Name));
}

const runsPerDay = (rows) => rows.reduce((acc, r) => acc + (r.IntervalMinutes > 0 ? 1440 / r.IntervalMinutes : 0), 0);
const fmt = (n) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

async function main() {
    if (!sql) { console.error('DATABASE_URL ausente.'); process.exit(1); }

    const all = await sql`select "Id","Name","Type","Active","IntervalMinutes" from "ScraperSchedules" order by "Id"`;
    if (!all.length) { console.log('Nenhum robô cadastrado.'); return; }

    const ativosAntes = all.filter((r) => r.Active);
    console.log(`Robôs no banco: ${all.length}  ·  ativos hoje: ${ativosAntes.length}`);
    console.log(`Consumo atual: ~${fmt(runsPerDay(ativosAntes))} runs/dia  (~${fmt(runsPerDay(ativosAntes) * 30)}/mês)\n`);

    if (RESTORE) {
        console.log(`Reativaria TODOS os ${all.length} robôs (volta ao estado anterior).`);
        if (!COMMIT) return console.log('\n(SIMULAÇÃO) Nada alterado. Para aplicar: --restore --commit');
        const r = await sql`update "ScraperSchedules" set "Active" = true, "UpdatedAt" = now() returning "Id"`;
        return console.log(`✅ ${r.length} robô(s) reativado(s).`);
    }

    const manter = all.filter(shouldKeep);
    const desativar = all.filter((r) => r.Active && !shouldKeep(r));

    if (!manter.length) {
        console.error('⚠️  Nenhum robô casou com o filtro — abortado para não desligar a coleta inteira.');
        console.error(`    Stacks pedidas: ${STACKS.join(', ')}`);
        process.exit(1);
    }

    // Projeção usando o intervalo final (se --interval foi passado).
    const projetados = manter.map((r) => ({ ...r, IntervalMinutes: INTERVAL || r.IntervalMinutes }));
    const porDia = runsPerDay(projetados);

    console.log(`MANTER ativos: ${manter.length}`);
    const porStack = {};
    for (const r of manter) {
        const k = isSaved(r.Name) ? '(recrutadores salvos)' : `${stackOf(r.Name)} · ${regionOf(r.Name).toUpperCase()}`;
        porStack[k] = (porStack[k] || 0) + 1;
    }
    for (const [k, n] of Object.entries(porStack).sort()) console.log(`   ${String(n).padStart(3)}x  ${k}`);

    console.log(`\nDESATIVAR: ${desativar.length} robô(s)`);
    for (const r of desativar.slice(0, 8)) console.log(`   - ${r.Name}`);
    if (desativar.length > 8) console.log(`   … e mais ${desativar.length - 8}`);

    console.log(`\n📊 Depois: ~${fmt(porDia)} runs/dia (~${fmt(porDia * 30)}/mês)`);
    const antes = runsPerDay(ativosAntes);
    if (antes > 0) console.log(`   Redução de ${fmt(antes)} → ${fmt(porDia)} runs/dia (${fmt(100 - (porDia / antes) * 100)}% menos)`);
    if (INTERVAL) console.log(`   Intervalo de todos os mantidos → ${INTERVAL} min`);
    if (STAGGER) console.log(`   NextRunAt espalhado ao longo do intervalo (evita disparo em bloco)`);
    console.log(`\n⚠️  Confira contra o crédito Apify real. Se ainda estourar, rode com --interval maior\n   (ex.: --interval=4320 = a cada 3 dias) ou --stacks com menos itens.`);

    if (!COMMIT) return console.log('\n(SIMULAÇÃO) Nada alterado. Para aplicar: --commit');

    const manterIds = manter.map((r) => Number(r.Id));
    const [off] = await sql`
        with u as (
            update "ScraperSchedules" set "Active" = false, "UpdatedAt" = now()
            where "Active" = true and "Id" <> all(${manterIds}::bigint[]) returning 1
        ) select count(*)::int as n from u`;

    if (INTERVAL) {
        await sql`update "ScraperSchedules" set "IntervalMinutes" = ${INTERVAL}, "UpdatedAt" = now()
                  where "Id" = any(${manterIds}::bigint[])`;
    }

    // Reativa os mantidos e espalha o próximo disparo: sem isso todos vencem
    // juntos e o agendador leva horas drenando a fila 3 por minuto.
    const [on] = await sql`
        with u as (
            update "ScraperSchedules"
            set "Active" = true,
                "NextRunAt" = ${STAGGER
                    ? sql`now() + (random() * make_interval(mins => "IntervalMinutes"))`
                    : sql`now()`},
                "UpdatedAt" = now()
            where "Id" = any(${manterIds}::bigint[]) returning 1
        ) select count(*)::int as n from u`;

    console.log(`\n✅ ${off.n} desativado(s) · ${on.n} ativo(s)${STAGGER ? ' com disparo espalhado' : ''}.`);
    console.log('   Reverter: node backend/scripts/rightsize-robots.mjs --restore --commit');
}

main()
    .catch((e) => { console.error('falhou:', e.message); process.exit(1); })
    .finally(() => sql?.end({ timeout: 5 }));
