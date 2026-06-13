import 'dotenv/config';
import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

// Node < 22 não tem WebSocket global; o supabase-js precisa para o realtime
// (que não usamos no backend, mas o client inicializa mesmo assim).
if (!globalThis.WebSocket) globalThis.WebSocket = ws;

// Cliente admin (service_role) — valida tokens e acessa Storage no backend.
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabaseConfigured = Boolean(url && key);

export const supabaseAdmin = supabaseConfigured
    ? createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { transport: ws },
    })
    : null;

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'cvs';
