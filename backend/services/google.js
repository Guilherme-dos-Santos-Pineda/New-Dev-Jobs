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

// --- state CSRF: mapeia state -> userId (em memória, TTL 10min) ---
const stateStore = new Map();
const STATE_TTL = 10 * 60 * 1000;

export function createState(userId) {
    const state = crypto.randomBytes(16).toString('hex');
    stateStore.set(state, { userId, exp: Date.now() + STATE_TTL });
    return state;
}

export function consumeState(state) {
    const entry = stateStore.get(state);
    if (!entry) return null;
    stateStore.delete(state);
    if (Date.now() > entry.exp) return null;
    return entry.userId;
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
