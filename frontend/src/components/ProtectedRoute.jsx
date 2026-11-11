import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useT } from '../lib/i18n.jsx';

// Quase sempre é o reinício de um deploy (alguns segundos) ou a internet da pessoa.
// Por isso tenta de novo sozinha, e o texto fala com quem usa, não com quem programa:
// dizia "Verifique se o backend está rodando" (relato do dono, 11/11/2026).
const INTERVALO_MS = 8000;
const TENTATIVAS_SOZINHA = 15; // ~2 minutos; depois disso, só pelo botão

function BackendUnreachable({ onRetry }) {
    const { t } = useT();
    const [busy, setBusy] = useState(false);
    const [semInternet, setSemInternet] = useState(typeof navigator !== 'undefined' && navigator.onLine === false);
    const tentativas = useRef(0);

    async function retry() {
        setBusy(true);
        try { await onRetry(); } catch { /* meError continua; a tela permanece */ }
        finally { setBusy(false); }
    }

    useEffect(() => {
        const timer = setInterval(() => {
            if (tentativas.current >= TENTATIVAS_SOZINHA) return clearInterval(timer);
            tentativas.current += 1;
            onRetry().catch(() => {});
        }, INTERVALO_MS);
        const online = () => { setSemInternet(false); onRetry().catch(() => {}); };
        const offline = () => setSemInternet(true);
        window.addEventListener('online', online);
        window.addEventListener('offline', offline);
        return () => { clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('offline', offline); };
    }, [onRetry]);

    return (
        <div className="auth-wrap">
            <div className="card auth-card" style={{ textAlign: 'center' }}>
                <h1>{semInternet ? t('Você está sem internet') : t('Voltamos em instantes')}</h1>
                <p className="muted" style={{ marginBottom: 16 }}>
                    {semInternet
                        ? t('Assim que a conexão voltar, a gente carrega tudo de novo sozinho.')
                        : t('O New Dev Jobs está passando por uma atualização rápida. Já estamos tentando de novo, e suas vagas e envios continuam salvos.')}
                </p>
                <button className="btn primary block" onClick={retry} disabled={busy}>
                    {busy ? t('Tentando…') : (<><i className="ti ti-refresh" /> {t('Tentar agora')}</>)}
                </button>
            </div>
        </div>
    );
}

export default function ProtectedRoute({ children }) {
    const { user, loading, session, meError, refreshUser } = useAuth();

    if (loading) {
        return <div className="center" style={{ minHeight: '100vh' }}><div className="spinner" /></div>;
    }
    // Sessão válida, mas /api/auth/me falhou por rede/5xx: backend fora.
    // Mostra erro com retry em vez de mandar para /login (que parece "login quebrado").
    if (session && meError === 'unreachable') {
        return <BackendUnreachable onRetry={refreshUser} />;
    }
    if (!user) return <Navigate to="/login" replace />;
    return children;
}
