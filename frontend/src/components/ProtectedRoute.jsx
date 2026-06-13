import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

function BackendUnreachable({ onRetry }) {
    const [busy, setBusy] = useState(false);
    async function retry() {
        setBusy(true);
        try { await onRetry(); } catch { /* meError continua; a tela permanece */ }
        finally { setBusy(false); }
    }
    return (
        <div className="auth-wrap">
            <div className="card auth-card" style={{ textAlign: 'center' }}>
                <h1>Servidor indisponível</h1>
                <div className="notice danger" style={{ marginBottom: 16 }}>
                    <i className="ti ti-plug-connected-x" />
                    Não foi possível conectar ao servidor. Verifique se o backend está rodando.
                </div>
                <button className="btn primary block" onClick={retry} disabled={busy}>
                    {busy ? 'Tentando…' : (<><i className="ti ti-refresh" /> Tentar de novo</>)}
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
