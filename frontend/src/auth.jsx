import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, classifyApiError } from './api.js';
import { supabase } from './lib/supabase.js';

const AuthCtx = createContext(null);

// Marca que o backend recusou a última sessão, para o Login explicar o motivo em
// vez de o usuário só ver o formulário de novo sem entender o que houve.
// sessionStorage porque a informação precisa sobreviver ao signOut + re-render.
export const SESSION_REJECTED = 'sessionRejected';

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

                // 401 SEM token enviado não é sessão inválida: é a sessão ainda
                // sendo restaurada do storage. Deslogar aqui transformava um
                // soluço de milissegundos em "toda hora dá erro de login", e
                // zerar o usuário mantendo a sessão recriava o laço /login ↔ /app.
                // Uma nova tentativa curta resolve — e se falhar de novo, cai no
                // tratamento normal abaixo.
                if (classifyApiError(err) === 'unauthorized' && err?.tokenEnviado === false) {
                    await new Promise((r) => setTimeout(r, 500));
                    if (!alive) return;
                    try {
                        await loadUser();
                        return; // deu certo na segunda: nada a reportar
                    } catch (err2) {
                        if (!alive) return;
                        err = err2;
                    }
                }

                const kind = classifyApiError(err);
                setMeError(kind);
                // Se o backend está fora/inacessível, mantém a sessão e deixa a UI
                // mostrar o erro com retry (ProtectedRoute).
                if (kind === 'unauthorized') {
                    setUser(null);
                    // O backend RECUSOU a sessão (não é indisponibilidade). Sem
                    // encerrá-la no Supabase, /login vê `session` e manda para /app,
                    // o ProtectedRoute vê `user` nulo e manda de volta para /login:
                    // laço de redirecionamento infinito, que na tela vira uma
                    // página travada. Encerrar devolve um formulário de login real.
                    try { sessionStorage.setItem(SESSION_REJECTED, '1'); } catch { /* modo privado */ }
                    await supabase?.auth.signOut();
                }
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
