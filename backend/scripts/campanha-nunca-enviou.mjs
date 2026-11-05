import 'dotenv/config';
import sql from '../lib/sql.js';
import { createCampaign } from '../services/campaigns.js';

// =========================================================================
// Email para quem criou conta e nunca enviou, um texto por etapa em que parou.
//
//   npm run campanha:nunca-enviou                 # SIMULA (só contagem)
//   npm run campanha:nunca-enviou -- --commit     # põe nos rascunhos de Campanhas
//   flags: --dias=3 (idade mínima da conta)
//
// NUNCA dispara: o envio começa no botão da tela de Campanhas. A lista é fixa
// depois de criada, por isso rode no dia do envio. O dono entra em todas para
// receber a cópia, e é o único destinatário se ainda não houver ninguém na lista.
// =========================================================================

const DONO = process.env.FUNIL_IGNORAR_EMAIL || 'guilhermesantospineda@gmail.com';
const commit = process.argv.includes('--commit');
const dias = Number(process.argv.find((a) => a.startsWith('--dias='))?.split('=')[1] ?? 3);

const REMETENTE = { fromEmail: 'newdevjobs <contato@newdevjobs.xyz>', replyTo: 'newdevoficial@gmail.com', dailyCap: 50, gapMin: 60, gapMax: 120 };

const CAMPANHAS = [
    {
        etapa: 'perfil',
        name: 'Nunca enviou: sem perfil',
        subject: 'O que te travou no New Dev Jobs?',
        body: `<p>Oi! Aqui é o Guilherme, do New Dev Jobs. Vi que você criou sua conta, mas não chegou a configurar.</p>
<p>Pode me contar o que aconteceu? Pode ser só uma frase, respondendo este email. Eu leio todas as respostas.</p>
<p>Se quiser continuar, é por aqui: <a href="https://newdevjobs.xyz/app">newdevjobs.xyz/app</a></p>`,
    },
    {
        etapa: 'gmail',
        name: 'Nunca enviou: sem Gmail',
        subject: 'Ficou alguma dúvida sobre o Gmail?',
        body: `<p>Oi! Aqui é o Guilherme, do New Dev Jobs. Vi que você configurou seu perfil, mas não conectou o Gmail.</p>
<p>Foi alguma dúvida ou desconfiança? Se foi: a gente só pede permissão para enviar, nunca para ler seus emails. E se preferir, dá para enviar você mesmo, sem conectar nada.</p>
<p>Me conta o que pesou, respondendo este email. Eu leio todas as respostas.</p>`,
    },
    {
        etapa: 'pronto',
        name: 'Nunca enviou: tudo pronto',
        subject: 'Por que você ainda não enviou?',
        body: `<p>Oi! Aqui é o Guilherme, do New Dev Jobs. Vi que está tudo pronto na sua conta, mas nenhum currículo saiu.</p>
<p>Queria entender o motivo, sem cobrança nenhuma. Foi receio de enviar sem ver antes? As vagas não combinaram? Ou só faltou tempo?</p>
<p>Pode responder este email com uma frase só. Isso ajuda muito a melhorar a ferramenta.</p>`,
    },
];

const contas = await sql`
    select lower(u."Email") as email, p."Areas" as areas,
        case when p."UserId" is null then 'perfil'
             when u."GoogleConnected" is not true then 'gmail'
             when p."CvPath" is not null then 'pronto' end as etapa
    from "Users" u
    left join "Profiles" p on p."UserId" = u."Id"
    where u."Email" <> ${DONO} and u."Email" not like '%teste-newdevjobs.local'
      and u."CreatedAt" < now() - make_interval(days => ${dias})
      and not exists (select 1 from "Applications" a where a."UserId" = u."Id")`;

const soDesign = (areas) => Array.isArray(areas) && areas.length > 0 && areas.every((a) => a === 'design');
const publico = contas.filter((c) => c.etapa && !soDesign(c.areas));

console.log(`\nContas com ${dias}+ dias que nunca enviaram: ${contas.length} (${contas.length - publico.length} fora: só design, ou Gmail sem currículo)\n`);

for (const c of CAMPANHAS) {
    const lista = publico.filter((p) => p.etapa === c.etapa).map((p) => p.email);
    console.log(`  ${c.name.padEnd(28)} ${String(lista.length).padStart(3)} pessoa(s)`);
    if (!commit) continue;

    const [rascunho] = await sql`select "Id" from "Campaigns" where "Name" = ${c.name} and "Status" = 'draft' order by "Id" desc limit 1`;
    if (!rascunho) {
        const criada = await createCampaign({ ...c, ...REMETENTE, emails: [DONO, ...lista] });
        console.log(`    rascunho ${criada.id} criado com ${criada.recipients} destinatário(s)`);
        continue;
    }
    if (!lista.length) continue;
    const saiu = new Set((await sql`select "Email" from "Unsubscribes" where "Email" = any(${lista}::text[])`).map((r) => r.Email));
    const novos = lista.filter((e) => !saiu.has(e)).map((Email) => ({ CampaignId: rascunho.Id, Email }));
    if (novos.length) await sql`insert into "CampaignRecipients" ${sql(novos, 'CampaignId', 'Email')} on conflict do nothing`;
    console.log(`    rascunho ${rascunho.Id}: ${novos.length} destinatário(s) acrescentado(s)`);
}

console.log(commit ? '\nNada foi enviado. Para disparar, use a tela de Campanhas.\n' : '\nSimulação. Com --commit vai para os rascunhos.\n');
await sql.end();
