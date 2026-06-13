import { google } from 'googleapis';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { config } from '../config.js';
import { authorizedClient } from './google.js';

// =========================
// Envio de email da candidatura
// =========================
// Modo 'gmail': envia de verdade pela conta do usuário (escopo gmail.send).
// Modo 'mock' : apenas registra no console (dev sem credenciais).

function buildMime({ from, to, subject, html, text, attachmentContent, filename }) {
    const attachments = [];
    if (attachmentContent) {
        attachments.push({
            filename: filename || 'curriculo.pdf',
            content: attachmentContent,
            contentType: 'application/pdf',
        });
    }
    const composer = new MailComposer({ from, to, subject, text, html, attachments });
    return composer.compile().build(); // Promise<Buffer>
}

function toBase64Url(buffer) {
    return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Envia o email da candidatura.
 * @returns { provider, messageId, sentAt, to }
 */
export async function sendApplicationEmail({ userId, from, to, subject, html, text, attachmentContent, filename }) {
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

    const mime = await buildMime({ from, to, subject, html, text, attachmentContent, filename });
    const raw = toBase64Url(mime);

    const { data } = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
    });

    return {
        provider: 'gmail',
        messageId: data.id,
        threadId: data.threadId,
        sentAt: new Date().toISOString(),
        to,
    };
}
