import { config } from '../config.js';

// =========================================================================
// Envio via Resend (API HTTP) — usado nas campanhas. Remetente = dominio
// AUTENTICADO no Resend (SPF/DKIM), o que resolve a entrega/spam. Sem SDK: fetch.
// =========================================================================

export const resendConfigured = config.resend.configured;

/**
 * Envia um email pelo Resend.
 * @returns { id } do email enviado
 * @throws  Error com a mensagem da API se falhar (ex.: dominio nao verificado)
 */
export async function sendResendEmail({ from, to, subject, html, text, headers, replyTo }) {
    if (!config.resend.configured) throw new Error('RESEND_API_KEY nao configurada');
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.resend.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}), ...(headers ? { headers } : {}) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        // Ex.: 403 "domain is not verified" → mensagem clara p/ o admin.
        throw new Error(data?.message || data?.error || `Resend HTTP ${res.status}`);
    }
    return { id: data.id };
}
