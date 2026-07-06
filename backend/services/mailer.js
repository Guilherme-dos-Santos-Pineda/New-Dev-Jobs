import { google } from 'googleapis';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { config } from '../config.js';
import { authorizedClient, isInvalidGrant, markGoogleDisconnected } from './google.js';

// =========================
// Envio de email da candidatura
// =========================
// Modo 'gmail': envia de verdade pela conta do usuário (escopo gmail.send).
// Modo 'mock' : apenas registra no console (dev sem credenciais).

function buildMime({ from, to, subject, html, text, attachmentContent, filename, headers }) {
    const attachments = [];
    if (attachmentContent) {
        attachments.push({
            filename: filename || 'curriculo.pdf',
            content: attachmentContent,
            contentType: 'application/pdf',
        });
    }
    // headers extras (ex.: List-Unsubscribe nas campanhas) — melhora entrega/anti-spam.
    const composer = new MailComposer({ from, to, subject, text, html, attachments, ...(headers ? { headers } : {}) });
    return composer.compile().build(); // Promise<Buffer>
}

function toBase64Url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Envia o email da candidatura.
 * @returns { provider, messageId, sentAt, to }
 */
export async function sendApplicationEmail({ userId, from, to, subject, html, text, attachmentContent, filename, headers }) {
    if (config.emailMode === 'mock') {
        await new Promise((r) => setTimeout(r, 120));
        console.log('📧 [MOCK] Email de candidatura');
        console.log('   de:', from || '(conta Google do usuário)');
        console.log('   para:', to);
        console.log('   assunto:', subject);
        console.log('   anexo:', attachmentContent ? (filename || 'curriculo.pdf') : '(nenhum)');
        return { provider: 'mock', messageId: `mock-${Date.now()}`, sentAt: new Date().toISOString(), to };
    }

    // Modo real: Gmail API
    const auth = await authorizedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth });

    const mime = await buildMime({ from, to, subject, html, text, attachmentContent, filename, headers });
    const raw = toBase64Url(mime);

    let data;
    try {
        ({ data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } }));
    } catch (err) {
        // Refresh token morto (revogado, ou expirado no modo "Teste" do Google após 7 dias):
        // marca a conexão como inválida e devolve um erro claro pedindo reconexão.
        if (isInvalidGrant(err)) {
            await markGoogleDisconnected(userId).catch(() => {});
            const e = new Error('Sua conexão com o Google expirou ou foi revogada. Reconecte sua conta Google em Perfil → Email.');
            e.code = 'GOOGLE_REAUTH';
            throw e;
        }
        throw err;
    }

    return {
        provider: 'gmail',
        messageId: data.id,
        threadId: data.threadId,
        sentAt: new Date().toISOString(),
        to,
    };
}
