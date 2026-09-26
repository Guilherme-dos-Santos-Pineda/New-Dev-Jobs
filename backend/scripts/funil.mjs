import 'dotenv/config';
import sql from '../lib/sql.js';

// =========================
// Funil de ativação (npm run funil)
// =========================
// Por que existe: toda decisão de produto aqui foi tomada olhando este número,
// e até agora ele era montado à mão, com um .mjs descartável, toda vez. Três
// vezes no mesmo dia. Um comando é mais barato e, principalmente, é comparável
// entre uma semana e outra, que é o que faz diferença.
//
// Não é analytics: não tem vendor, não tem script no navegador, não tem tabela
// nova. É uma consulta ao que o banco já guarda. Também não é bonito, é para
// ser lido no terminal antes de mexer em preço ou em onboarding.
//
// O DONO NÃO ENTRA NA CONTA. Ele configurou tudo, envia todo dia e pagaria zero
// de qualquer jeito: deixá-lo dentro inflava cada etapa e fazia o funil parecer
// melhor do que é. Contas de teste também ficam fora.

const DONO = process.env.FUNIL_IGNORAR_EMAIL || 'guilhermesantospineda@gmail.com';

const pct = (n, base) => (base ? `${Math.round((n / base) * 100)}%` : '  0%');
const barra = (n, base) => '█'.repeat(Math.round((base ? n / base : 0) * 24)).padEnd(24, '·');

function linha(rotulo, n, base, anterior) {
    // "de quem chegou no passo anterior" é a taxa que importa: 20% do total
    // pode ser 100% de quem tentou, e as duas leituras pedem ações opostas.
    const daEtapa = anterior == null ? '' : `  ${pct(n, anterior).padStart(4)} de quem chegou aqui`;
    console.log(`  ${rotulo.padEnd(26)} ${String(n).padStart(4)}  ${barra(n, base)} ${pct(n, base).padStart(4)}${daEtapa}`);
}

// As etapas são ACUMULADAS de propósito: "subiu currículo" conta só quem
// também já tinha perfil e skills. No app a ordem é livre (dá para anexar o PDF
// sem escolher skill nenhuma), e contar cada etapa solta produzia degrau
// crescente e uma taxa de 117% na tela, que além de feia é mentira: sugeria
// que a etapa recupera gente que ela nunca teve.
const [f] = await sql`
    with base as (
        select
            u."Id",
            (p."UserId" is not null)                                            as tem_perfil,
            (jsonb_array_length(coalesce(p."Skills", '[]'::jsonb)) > 0)         as tem_skills,
            (p."CvPath" is not null)                                            as tem_cv,
            (u."GoogleConnected" is true)                                       as tem_gmail
        from "Users" u
        left join "Profiles" p on p."UserId" = u."Id"
        where u."Email" <> ${DONO} and u."Email" not like '%teste-newdevjobs.local'
    )
    select
        count(*)::int                                                                   as contas,
        count(*) filter (where tem_perfil)::int                                         as perfil,
        count(*) filter (where tem_perfil and tem_skills)::int                          as skills,
        count(*) filter (where tem_perfil and tem_skills and tem_cv)::int               as cv,
        count(*) filter (where tem_perfil and tem_skills and tem_cv and tem_gmail)::int as gmail
    from base`;

const [e] = await sql`
    select
        count(distinct "UserId") filter (where "Status" = 'sent')::int   as enviaram_auto,
        count(distinct "UserId") filter (where "Status" = 'manual')::int as enviaram_mao,
        count(distinct "UserId")::int                                     as enviaram_qualquer,
        count(*) filter (where "Status" = 'sent')::int                    as total_auto,
        count(*) filter (where "Status" = 'manual')::int                  as total_mao
    from "Applications"
    where "UserId" in (select "Id" from "Users" where "Email" <> ${DONO} and "Email" not like '%teste-newdevjobs.local')`;

// Plano pago SEM cliente do Stripe é concessão manual, não venda. Misturar os
// dois faria uma cortesia parecer faturamento.
const [v] = await sql`
    select
        count(*) filter (where "Plan" is distinct from 'free' and "StripeCustomerId" is not null)::int as vendas,
        count(*) filter (where "Plan" is distinct from 'free' and "StripeCustomerId" is null)::int     as concessoes
    from "Users" where "Email" <> ${DONO} and "Email" not like '%teste-newdevjobs.local'`;

const [n] = await sql`
    select
        count(*) filter (where "CreatedAt" > now() - interval '7 days')::int  as semana,
        count(*) filter (where "CreatedAt" > now() - interval '30 days')::int as mes
    from "Users" where "Email" <> ${DONO} and "Email" not like '%teste-newdevjobs.local'`;

console.log('\n=============================================================');
console.log(` FUNIL DE ATIVAÇÃO — ${new Date().toISOString().slice(0, 10)}`);
console.log(` (sem o dono e sem contas de teste)`);
console.log('=============================================================\n');

linha('criaram conta', f.contas, f.contas);
linha('salvaram perfil', f.perfil, f.contas, f.contas);
linha('preencheram skills', f.skills, f.contas, f.perfil);
linha('subiram currículo', f.cv, f.contas, f.skills);
linha('conectaram o Gmail', f.gmail, f.contas, f.cv);
linha('enviaram alguma coisa', e.enviaram_qualquer, f.contas, f.gmail);
linha('PAGARAM', v.vendas, f.contas, e.enviaram_qualquer);

console.log('\n  Candidaturas por caminho');
console.log(`    automático (Gmail conectado)  ${String(e.total_auto).padStart(5)} envios · ${e.enviaram_auto} pessoa(s)`);
console.log(`    na mão (sem conectar nada)    ${String(e.total_mao).padStart(5)} envios · ${e.enviaram_mao} pessoa(s)`);

console.log('\n  Entradas');
console.log(`    últimos 7 dias  ${n.semana}`);
console.log(`    últimos 30 dias ${n.mes}`);

console.log('\n  Receita');
console.log(`    vendas de verdade (Stripe)  ${v.vendas}`);
console.log(`    concessões manuais          ${v.concessoes}`);

// O maior degrau é onde mexer. Dizer isso aqui evita ler o funil inteiro e
// mexer no lugar errado, que foi o erro que quase aconteceu com a landing:
// ela convertia, o app é que perdia gente.
const passos = [
    ['criar conta → salvar perfil', f.contas - f.perfil],
    ['salvar perfil → skills', f.perfil - f.skills],
    ['skills → currículo', f.skills - f.cv],
    ['currículo → conectar Gmail', f.cv - f.gmail],
    ['conectar → enviar', Math.max(0, f.gmail - e.enviaram_qualquer)],
    ['enviar → pagar', e.enviaram_qualquer - v.vendas],
];
const pior = passos.reduce((a, b) => (b[1] > a[1] ? b : a));
console.log(`\n  Maior degrau: ${pior[0]} (perde ${pior[1]})\n`);

await sql.end();
