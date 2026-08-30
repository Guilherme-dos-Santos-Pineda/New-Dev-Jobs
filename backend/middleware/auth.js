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

// =========================
// Tokens deslogados
// =========================
// O access_token do Supabase é um JWT: vale pela ASSINATURA, não por uma sessão
// consultada a cada uso. Encerrar a sessão no Supabase revoga o refresh token,
// mas o access token que já está na mão de alguém CONTINUA VÁLIDO até expirar —
// medido: até 1 hora depois do logout, `getUser()` ainda devolvia o usuário.
//
// Tirar do cache local não resolvia: sem cache, a próxima requisição pergunta ao
// Supabase e o Supabase responde que o token é bom. O logout precisa de uma
// lista de recusa própria — é o único jeito de o "sair" significar sair AGORA.
//
// A entrada morre junto com o token (usamos o `exp` do próprio JWT), então a
// lista não cresce: no pior caso guarda os logouts da última hora.
const deslogados = new Map(); // token -> expira em (ms)

/** Lê o `exp` do JWT sem validar assinatura — serve só para limitar a memória. */
function expiraEm(token) {
    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
        if (Number.isFinite(payload?.exp)) return payload.exp * 1000;
    } catch { /* token malformado: cai no padrão abaixo */ }
    return Date.now() + 60 * 60 * 1000; // 1h é o tempo de vida padrão do Supabase
}

/** Logout: invalida este token AGORA, no cache e para o resto da vida dele. */
export function purgeToken(token) {
    if (!token) return;
    cache.delete(token);
    deslogados.set(token, expiraEm(token));
}

/** Este token foi deslogado e ainda não expirou? */
export function foiDeslogado(token) {
    const ate = deslogados.get(token);
    if (ate === undefined) return false;
    if (ate <= Date.now()) { deslogados.delete(token); return false; }
    return true;
}

// Remove entradas expiradas (tokens que rotacionaram e nunca mais voltam ficariam
// presos no Map). Throttled: varre no máx. a cada TTL, em um cache-miss.
let lastSweep = 0;
function sweepCache() {
    const now = Date.now();
    if (now - lastSweep < TTL) return;
    lastSweep = now;
    for (const [token, v] of cache) if (v.exp <= now) cache.delete(token);
    for (const [token, ate] of deslogados) if (ate <= now) deslogados.delete(token);
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
        if (token && supabaseAdmin && !foiDeslogado(token)) {
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
                } else if (error) {
                    // Token recusado pelo Supabase. Antes isto era descartado em
                    // silêncio: o usuário levava 401 e não havia UMA linha de log
                    // dizendo por quê — nem "token expirado", nem "chave errada".
                    // Diagnosticar exigia adivinhar. Nunca logamos o token.
                    console.error('attachUser: Supabase recusou o token:', error.message);
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
