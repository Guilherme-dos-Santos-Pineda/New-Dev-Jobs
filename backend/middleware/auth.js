import sql from '../lib/sql.js';
import { config } from '../config.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';

// =========================
// Auth via Supabase (JWT no header Authorization: Bearer <access_token>)
// =========================
// Valida o token com o Supabase (getUser) e mapeia para a linha em "Users".
// Cache leve token->authUser (60s) evita uma chamada de rede por request;
// a linha de "Users" é sempre lida fresca (Plan/GoogleConnected atualizados).

const cache = new Map(); // token -> { authUser, exp }
const TTL = 60 * 1000;

// Remove entradas expiradas (tokens que rotacionaram e nunca mais voltam ficariam
// presos no Map). Throttled: varre no máx. a cada TTL, em um cache-miss.
let lastSweep = 0;
function sweepCache() {
    const now = Date.now();
    if (now - lastSweep < TTL) return;
    lastSweep = now;
    for (const [token, v] of cache) if (v.exp <= now) cache.delete(token);
}

async function loadUserRow(authUser) {
    let [row] = await sql`select * from "Users" where "Id" = ${authUser.id}`;
    if (!row) {
        const name = authUser.user_metadata?.name
            || authUser.user_metadata?.full_name
            || (authUser.email || '').split('@')[0];
        await sql`
            insert into "Users" ("Id", "Name", "Email") values (${authUser.id}, ${name}, ${authUser.email})
            on conflict ("Id") do nothing`;
        [row] = await sql`select * from "Users" where "Id" = ${authUser.id}`;
    }
    return row;
}

export async function attachUser(req, _res, next) {
    try {
        const header = req.headers.authorization || '';
        const token = header.startsWith('Bearer ') ? header.slice(7) : null;
        if (token && supabaseAdmin) {
            let authUser;
            const cached = cache.get(token);
            if (cached && cached.exp > Date.now()) {
                authUser = cached.authUser;
            } else {
                if (cached) cache.delete(token); // expirado: remove p/ não acumular
                const { data, error } = await supabaseAdmin.auth.getUser(token);
                if (!error && data?.user) {
                    authUser = data.user;
                    cache.set(token, { authUser, exp: Date.now() + TTL });
                    sweepCache();
                }
            }
            if (authUser) req.user = await loadUserRow(authUser);
        }
    } catch (e) {
        console.error('attachUser:', e.message);
    }
    next();
}

export function requireAuth(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    next();
}

export function requireAdmin(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    const isAdmin = config.isAdminEmail(req.user.Email) || req.user.Role === 'admin';
    if (!isAdmin) return res.status(403).json({ error: 'Acesso restrito a administradores' });
    next();
}
