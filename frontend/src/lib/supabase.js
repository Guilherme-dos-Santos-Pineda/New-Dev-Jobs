import { createClient } from '@supabase/supabase-js';

// Cliente do Supabase Auth no frontend.
// Variáveis em frontend/.env (prefixo VITE_).
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anon);

export const supabase = supabaseConfigured
    ? createClient(url, anon, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
    : null;
