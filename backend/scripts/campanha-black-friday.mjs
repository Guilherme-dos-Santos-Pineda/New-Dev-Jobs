import 'dotenv/config';
import sql from '../lib/sql.js';
import { createCampaign } from '../services/campaigns.js';
import { PROMOCAO, promocaoAtiva } from '../config/promocao.js';

// =========================================================================
// Black Friday 2026 (config/promocao.js): dois rascunhos em Campanhas.
//
//   npm run campanha:black-friday                 # SIMULA (só contagem)
//   npm run campanha:black-friday -- --commit     # põe nos rascunhos de Campanhas
//
// 1. Quem está no grátis e bateu o limite de 20 por dia nos últimos 30 dias: é
//    quem mais quer mandar mais (medido em 19/11/2026: 113 de 200 ativos).
// 2. Quem tem o Automático: pagamento único não renova sozinho, e na promoção
//    renovar dá 60 dias somados aos que faltam.
//
// NUNCA dispara: o envio começa no botão da tela de Campanhas. O dono entra nas
// duas para receber a cópia. Quem pediu para sair da lista fica de fora
// (createCampaign confere "Unsubscribes").
// =========================================================================

const DONO = process.env.FUNIL_IGNORAR_EMAIL || 'guilhermesantospineda@gmail.com';
const commit = process.argv.includes('--commit');
const REMETENTE = { fromEmail: 'newdevjobs <contato@newdevjobs.xyz>', replyTo: 'newdevoficial@gmail.com', dailyCap: 150, gapMin: 60, gapMax: 120 };

if (!promocaoAtiva()) {
    console.log(`A promoção (${PROMOCAO.inicio} a ${PROMOCAO.fim}) não está valendo agora. Nada a fazer.`);
    await sql.end();
    process.exit(0);
}

const LINK = 'https://newdevjobs.xyz/app/assinatura?utm_source=email&utm_medium=campanha&utm_campaign=black-friday-2026';

const CAMPANHAS = [
    {
        name: 'Black Friday: bateu o limite',
        subject: 'Você bateu o limite de 20 por dia. Na Black Friday, são 60 dias de Automático por R$ 10',
        body: `<p>Oi! Aqui é o Guilherme, do New Dev Jobs.</p>
<p>Vi que, neste mês, você chegou ao limite de 20 currículos por dia. Quem manda tanto costuma querer mandar mais, então vai a oferta da Black Friday:</p>
<p><strong>Até 30/11, o Automático vale 60 dias pelo preço de 30: R$ 10, pagamento único.</strong></p>
<ul>
<li>até 50 envios por dia, em vez de 20;</li>
<li>seu currículo sai sozinho todo dia às 9h, sem você entrar;</li>
<li>um robô busca vagas novas pelo seu perfil todo dia;</li>
<li>a IA monta um currículo para cada tipo de vaga.</li>
</ul>
<p>Não é assinatura: não renova sozinho e não guarda cartão. Dá para pagar com Pix.</p>
<p><a href="${LINK}">Quero os 60 dias</a></p>
<p>Se o grátis já te atende, tudo bem também: ele continua igual.</p>`,
        sql: sql`
            select distinct lower(u."Email") as email
            from "Users" u join "Applications" a on a."UserId" = u."Id"
            where u."Plan" = 'free' and u."Email" <> ${DONO} and u."Email" not like '%teste-newdevjobs.local'
              and a."SentAt" > now() - interval '30 days'
            group by u."Email", a."SentAt"::date
            having count(*) >= 20`,
    },
    {
        name: 'Black Friday: renovação',
        subject: 'Renove o Automático na Black Friday e ganhe 60 dias',
        body: `<p>Oi! Aqui é o Guilherme, do New Dev Jobs. Obrigado por apoiar o projeto com o Automático.</p>
<p>Seu plano é um pagamento único e não renova sozinho. Na Black Friday, <strong>até 30/11, renovar dá 60 dias pelo mesmo R$ 10</strong>, e eles somam aos dias que você ainda tem. Ninguém perde nada renovando antes.</p>
<p><a href="${LINK}">Renovar com 60 dias</a></p>
<p>Qualquer coisa, é só responder este email.</p>`,
        sql: sql`
            select lower("Email") as email from "Users"
            where "Plan" = 'starter' and "StripeCustomerId" is not null and "Email" <> ${DONO}
              and ("PlanExpiresAt" is null or "PlanExpiresAt" > now() - interval '30 days')`,
    },
];

for (const c of CAMPANHAS) {
    const lista = [...new Set((await c.sql).map((r) => r.email))];
    console.log(`  ${c.name.padEnd(30)} ${String(lista.length).padStart(4)} pessoa(s)`);
    if (!commit) continue;
    const [ja] = await sql`select "Id" from "Campaigns" where "Name" = ${c.name} order by "Id" desc limit 1`;
    if (ja) { console.log(`    já existe (campanha ${ja.Id}): não criei outra`); continue; }
    const criada = await createCampaign({ name: c.name, subject: c.subject, body: c.body, ...REMETENTE, emails: [DONO, ...lista] });
    console.log(`    rascunho ${criada.id} criado com ${criada.recipients} destinatário(s) (${criada.ignored} fora por descadastro)`);
}
if (!commit) console.log('\n  Simulação. Para criar os rascunhos: npm run campanha:black-friday -- --commit\n');
await sql.end();
