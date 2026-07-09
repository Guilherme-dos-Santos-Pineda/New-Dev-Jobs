import sql from '../lib/sql.js';
import { config } from '../config.js';
import { sendApplicationEmail } from './mailer.js';
import { sendResendEmail, resendConfigured } from './resend.js';

// =========================================================================
// Email marketing / campanhas: envio ESPAÇADO (anti-bloqueio), teto diário e
// opt-out (descadastro). O worker chama tickCampaigns() no loop do agendador;
// aqui fica a lógica. Envia pela conta Google conectada em Campaigns.FromEmail.
// =========================================================================

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Link de descadastro + rodapé (obrigatório na prática p/ não virar spam).
function withUnsubscribe(bodyHtml, token) {
    const url = `${config.apiUrl}/api/public/unsubscribe?token=${token}`;
    return `${bodyHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center" style="padding:4px 16px 32px;">
    <p style="font-size:12px;line-height:20px;color:#9ca3af;margin:0;max-width:600px;">
      Você recebeu este email porque demonstrou interesse no newdevjobs.
      <a href="${url}" style="color:#9ca3af;">Descadastrar</a>.
    </p>
  </td></tr>
</table>`;
}

// Cria a campanha + destinatários (dedup, e-mails válidos, pula quem já saiu).
export async function createCampaign({ name, subject, body, fromEmail, replyTo, dailyCap, gapMin, gapMax, emails }) {
    const clean = [...new Set((emails || []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)))];
    if (!clean.length) throw new Error('Nenhum email válido na lista.');
    const optedOut = new Set((await sql`select "Email" from "Unsubscribes" where "Email" = any(${clean})`).map((r) => r.Email));
    const toInsert = clean.filter((e) => !optedOut.has(e));

    const [c] = await sql`
        insert into "Campaigns" ("Name","Subject","Body","FromEmail","ReplyTo","DailyCap","GapMinSec","GapMaxSec","Status")
        values (${name}, ${subject}, ${body}, ${fromEmail}, ${replyTo?.trim() || null}, ${Math.max(1, Math.min(500, Number(dailyCap) || 50))},
                ${Math.max(30, Number(gapMin) || 60)}, ${Math.max(30, Number(gapMax) || 120)}, 'draft')
        returning "Id"`;
    if (toInsert.length) {
        await sql`insert into "CampaignRecipients" ${sql(toInsert.map((Email) => ({ CampaignId: c.Id, Email })), 'CampaignId', 'Email')}`;
    }
    return { id: Number(c.Id), recipients: toInsert.length, ignored: clean.length - toInsert.length };
}

const shape = (c) => ({
    id: Number(c.Id), name: c.Name, subject: c.Subject, body: c.Body, fromEmail: c.FromEmail, replyTo: c.ReplyTo,
    dailyCap: c.DailyCap, status: c.Status, createdAt: c.CreatedAt,
    total: Number(c.total), sent: Number(c.sent), pending: Number(c.pending), failed: Number(c.failed), unsub: Number(c.unsub),
    sentToday: Number(c.sent_today),
});

export async function listCampaigns() {
    const rows = await sql`
        select c.*,
            count(r."Id")::int as total,
            count(r."Id") filter (where r."Status"='sent')::int as sent,
            count(r."Id") filter (where r."Status"='pending')::int as pending,
            count(r."Id") filter (where r."Status"='failed')::int as failed,
            count(r."Id") filter (where r."Status"='unsubscribed')::int as unsub,
            count(r."Id") filter (where r."Status"='sent' and r."SentAt"::date = current_date)::int as sent_today
        from "Campaigns" c left join "CampaignRecipients" r on r."CampaignId" = c."Id"
        group by c."Id" order by c."Id" desc`;
    return rows.map(shape);
}

export async function setCampaignStatus(id, status) {
    if (!['running', 'paused', 'draft'].includes(status)) throw new Error('status inválido');
    await sql`update "Campaigns" set "Status" = ${status}, "UpdatedAt" = now() where "Id" = ${id}`;
}

export async function deleteCampaign(id) {
    await sql`delete from "Campaigns" where "Id" = ${id}`;
}

// Descadastro (opt-out) por token: marca o destinatário e bloqueia o email globalmente.
export async function unsubscribeByToken(token) {
    const [r] = await sql`select "Id","Email","CampaignId" from "CampaignRecipients" where "Token" = ${token}`;
    if (!r) return { ok: false };
    await sql`update "CampaignRecipients" set "Status"='unsubscribed' where "Id" = ${r.Id}`;
    await sql`insert into "Unsubscribes" ("Email","CampaignId") values (${r.Email}, ${r.CampaignId}) on conflict ("Email") do nothing`;
    // também remove de outras campanhas pendentes
    await sql`update "CampaignRecipients" set "Status"='unsubscribed' where "Email"=${r.Email} and "Status"='pending'`;
    return { ok: true, email: r.Email };
}

// Processa UM envio por campanha ativa, respeitando teto diário e espaçamento.
// Chamado pelo agendador do worker (a cada ~60s). Envia no máximo 1 por campanha/tick.
export async function tickCampaigns() {
    let camps;
    try { camps = await sql`select * from "Campaigns" where "Status"='running'`; }
    catch (e) { if (e.code === '42P01') return; throw e; } // tabela ainda não migrada → ignora
    for (const c of camps) {
        try {
            // teto diário
            const [{ n: sentToday }] = await sql`select count(*)::int as n from "CampaignRecipients" where "CampaignId"=${c.Id} and "Status"='sent' and "SentAt"::date = current_date`;
            if (sentToday >= c.DailyCap) continue;

            // espaçamento: só envia se passou o gap mínimo desde o último envio desta campanha
            const [last] = await sql`select "SentAt" from "CampaignRecipients" where "CampaignId"=${c.Id} and "Status"='sent' order by "SentAt" desc limit 1`;
            if (last?.SentAt && (Date.now() - new Date(last.SentAt).getTime()) / 1000 < c.GapMinSec) continue;

            // próximo pendente (que não saiu da lista global)
            const [rcp] = await sql`
                select r.* from "CampaignRecipients" r
                where r."CampaignId"=${c.Id} and r."Status"='pending'
                  and not exists (select 1 from "Unsubscribes" u where u."Email"=r."Email")
                order by r."Id" asc limit 1`;
            if (!rcp) { await sql`update "Campaigns" set "Status"='done', "UpdatedAt"=now() where "Id"=${c.Id}`; continue; }

            const html = withUnsubscribe(String(c.Body).replace(/\{email\}/g, rcp.Email), rcp.Token);
            const text = String(c.Body).replace(/\{email\}/g, rcp.Email).replace(/<[^>]+>/g, ' ');
            // List-Unsubscribe (1 clique): exigido pelo Gmail p/ envio em volume — melhora entrega.
            const unsubUrl = `${config.apiUrl}/api/public/unsubscribe?token=${rcp.Token}`;
            const headers = { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
            // Reply-To: respostas caem num email real (o "De:" continua no domínio).
            if (c.ReplyTo) headers['Reply-To'] = c.ReplyTo;

            // Preferência: Resend (domínio autenticado → cai na inbox). Fallback: Gmail
            // da conta conectada. Sem nenhum dos dois → pausa a campanha.
            let sender = null;
            if (!resendConfigured) {
                [sender] = await sql`select "Id","GoogleEmail","Email" from "Users" where lower("GoogleEmail")=lower(${c.FromEmail}) and "GoogleConnected"=true limit 1`;
                if (!sender) {
                    await sql`update "Campaigns" set "Status"='paused', "UpdatedAt"=now() where "Id"=${c.Id}`;
                    console.warn(`⚠️  campanha ${c.Id}: sem Resend e remetente ${c.FromEmail} não conectado ao Google — pausada.`);
                    continue;
                }
            }
            try {
                if (resendConfigured) {
                    await sendResendEmail({ from: c.FromEmail, to: rcp.Email, subject: c.Subject, html, text, headers, replyTo: c.ReplyTo });
                } else {
                    await sendApplicationEmail({ userId: sender.Id, from: sender.GoogleEmail || sender.Email, to: rcp.Email, subject: c.Subject, html, text, headers });
                }
                await sql`update "CampaignRecipients" set "Status"='sent', "SentAt"=now() where "Id"=${rcp.Id}`;
                console.log(`📣 campanha ${c.Id}: enviado para ${rcp.Email} via ${resendConfigured ? 'Resend' : 'Gmail'} (${sentToday + 1}/${c.DailyCap})`);
            } catch (e) {
                await sql`update "CampaignRecipients" set "Status"='failed', "Error"=${String(e.message || 'erro').slice(0, 200)} where "Id"=${rcp.Id}`;
                // Falha de envio costuma ser sistêmica (domínio Resend não verificado,
                // API key ruim, Gmail expirado) → pausa a campanha p/ não queimar a lista.
                await sql`update "Campaigns" set "Status"='paused', "UpdatedAt"=now() where "Id"=${c.Id}`;
                console.warn(`⚠️  campanha ${c.Id} pausada após falha: ${String(e.message).slice(0, 100)}`);
            }
        } catch (e) {
            console.error(`campanha ${c.Id} tick falhou:`, e.message);
        }
    }
}
