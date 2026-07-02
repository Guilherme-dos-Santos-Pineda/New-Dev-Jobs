import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, classifyApiError } from './api.js';
import { supabase } from './lib/supabase.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
    const [session, setSession] = useState(null);
    const [user, setUser] = useState(null); // dados do app (plano, google, etc.)
    const [googleConfigured, setGoogleConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    // null | 'unauthorized' (sessão recusada) | 'unreachable' (backend fora/erro de rede)
    const [meError, setMeError] = useState(null);

    // Observa a sessão do Supabase
    useEffect(() => {
        if (!supabase) { setLoading(false); return; }
        supabase.auth.getSession().then(({ data }) => setSession(data.session));
        const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
        return () => sub.subscription.unsubscribe();
    }, []);

    const loadUser = useCallback(async () => {
        const { user, googleConfigured } = await api.me();
        setUser(user);
        setGoogleConfigured(!!googleConfigured);
        setMeError(null);
        return user;
    }, []);

    // Quando a sessão muda, carrega o usuário do app
    useEffect(() => {
        let alive = true;
        (async () => {
            if (!session) { if (alive) { setUser(null); setMeError(null); setLoading(false); } return; }
            try {
                await loadUser();
            } catch (err) {
                if (!alive) return;
                const kind = classifyApiError(err);
                setMeError(kind);
                // Só desloga se o backend recusou a sessão. Se ele está fora/inacessível,
                // mantém a sessão e deixa a UI mostrar o erro com retry (ProtectedRoute).
                if (kind === 'unauthorized') setUser(null);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [session, loadUser]);

    const refreshUser = useCallback(async () => {
        try {
            return await loadUser();
        } catch (err) {
            setMeError(classifyApiError(err));
            throw err;
        }
    }, [loadUser]);

    const logout = useCallback(async () => {
        // Avisa o backend ANTES do signOut (depois o token já não vale) para ele
        // derrubar o token do cache na hora. Best-effort: logout local não depende disso.
        try { await api.logout(); } catch { /* backend fora não impede o logout */ }
        await supabase?.auth.signOut();
        setUser(null);
        setSession(null);
        setMeError(null);
    }, []);

    return (
        <AuthCtx.Provider value={{ session, user, googleConfigured, loading, meError, refreshUser, logout, setUser }}>
            {children}
        </AuthCtx.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthCtx);
    if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
    return ctx;
}
