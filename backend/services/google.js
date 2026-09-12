import { google } from 'googleapis';
import crypto from 'crypto';
import { config } from '../config.js';
import sql from '../lib/sql.js';

// =========================
// Google OAuth2 + Gmail
// =========================

export function oauthClient() {
    return new google.auth.OAuth2(
        config.google.clientId,
        config.google.clientSecret,
        config.google.redirectUri
    );
}

// =========================
// state CSRF — ASSINADO, não guardado em memória
// =========================
// Era um Map no processo. O usuário clica em "Conectar Google", vai para o
// consentimento e volta — e se o servidor REINICIAR nesse intervalo, o Map some
// junto: o callback não reconhece o próprio state e responde "Sessão de conexão
// expirou, tente de novo". Não é hipótese: todo deploy reinicia o serviço, e o
// primeiro usuário de fora esbarrou exatamente nisso num dia de três deploys.
//
// Agora o state carrega a informação assinada em vez de ser uma chave para algo
// guardado: `payload.assinatura`. Qualquer processo consegue validar, restart não
// derruba nada, e continua valendo como CSRF porque só nós sabemos assinar.
//
// A chave do HMAC é o próprio GOOGLE_CLIENT_SECRET de propósito: sem ele este
// fluxo não funciona mesmo, então não introduz uma variável de ambiente nova que
// alguém esqueceria de definir na VM — e faltando, o deploy quebraria em silêncio.
const STATE_TTL = 10 * 60 * 1000;

const assinar = (payload) => crypto
    .createHmac('sha256', config.google.clientSecret || 'sem-segredo')
    .update(payload).digest('base64url');

export function createState(userId) {
    const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + STATE_TTL })).toString('base64url');
    return `${payload}.${assinar(payload)}`;
}

export function consumeState(state) {
    const [payload, sig] = String(state || '').split('.');
    if (!payload || !sig) return null;

    // timingSafeEqual exige buffers do mesmo tamanho — comparar antes evita o
    // throw e já descarta assinatura de tamanho errado.
    const esperada = Buffer.from(assinar(payload));
    const recebida = Buffer.from(sig);
    if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;

    try {
        const { u, e } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (!u || !e || Date.now() > e) return null;
        return u;
    } catch { return null; }
}

export function getAuthUrl(userId) {
    const client = oauthClient();
    return client.generateAuthUrl({
        access_type: 'offline', // garante refresh_token
        prompt: 'consent', // força retorno do refresh_token
        scope: config.google.scopes,
        state: createState(userId),
    });
}

/** Troca o code pelos tokens, descobre o email e persiste. */
export async function exchangeCodeAndStore(code, userId) {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);

    // Descobre o email da conta Google conectada
    let email = null;
    try {
        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const { data } = await oauth2.userinfo.get();
        email = data.email;
    } catch { /* opcional */ }

    await sql`
        update "Users" set
            "GoogleConnected" = true,
            "GoogleEmail" = ${email},
            "GoogleRefreshToken" = coalesce(${tokens.refresh_token || null}, "GoogleRefreshToken"),
            "GoogleAccessToken" = ${tokens.access_token || null},
            "GoogleTokenExpiry" = ${tokens.expiry_date || null}
        where "Id" = ${userId}`;

    return { email };
}

async function getUserTokens(userId) {
    const [row] = await sql`select "GoogleRefreshToken", "GoogleAccessToken", "GoogleTokenExpiry" from "Users" where "Id" = ${userId}`;
    return row;
}

/** Retorna um OAuth2 client autorizado para o usuário (renova access token se preciso). */
export async function authorizedClient(userId) {
    const row = await getUserTokens(userId);
    if (!row?.GoogleRefreshToken) {
        throw new Error('Conta Google não conectada');
    }
    const client = oauthClient();
    client.setCredentials({
        refresh_token: row.GoogleRefreshToken,
        access_token: row.GoogleAccessToken || undefined,
        expiry_date: row.GoogleTokenExpiry || undefined,
    });

    // Renova automaticamente; persiste novo access token quando emitido
    client.on('tokens', (t) => {
        if (t.access_token) {
            sql`update "Users" set "GoogleAccessToken" = ${t.access_token}, "GoogleTokenExpiry" = ${t.expiry_date || null} where "Id" = ${userId}`
                .catch((e) => console.error('updateAccess:', e.message));
        }
    });

    return client;
}

// Detecta o erro de refresh token inválido/expirado/revogado do Google.
export function isInvalidGrant(err) {
    const m = err?.response?.data?.error || err?.response?.data?.error_description || err?.message || '';
    return /invalid_grant/i.test(String(m));
}

// Marca a conexão Google como inválida (sem tentar revogar — o token já está morto),
// para a UI pedir reconexão. Usado quando um envio retorna invalid_grant.
export async function markGoogleDisconnected(userId) {
    await sql`
        update "Users" set "GoogleConnected" = false, "GoogleRefreshToken" = null,
            "GoogleAccessToken" = null, "GoogleTokenExpiry" = null where "Id" = ${userId}`;
}

export async function disconnect(userId) {
    const row = await getUserTokens(userId);
    if (row?.GoogleRefreshToken && config.google.configured) {
        try {
            const client = oauthClient();
            client.setCredentials({ refresh_token: row.GoogleRefreshToken });
            await client.revokeCredentials();
        } catch { /* ignora falha de revogação */ }
    }
    await sql`
        update "Users" set "GoogleConnected" = false, "GoogleEmail" = null, "GoogleRefreshToken" = null,
            "GoogleAccessToken" = null, "GoogleTokenExpiry" = null where "Id" = ${userId}`;
}
