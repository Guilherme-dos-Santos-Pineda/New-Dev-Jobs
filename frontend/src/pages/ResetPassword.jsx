import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import Logo from '../components/Logo.jsx';
import { authError } from '../lib/authErrors.js';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [ready, setReady] = useState(false); // sessão de recuperação detectada
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [done, setDone] = useState(false);

    // O link do email cria uma sessão de recuperação (detectSessionInUrl).
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => setReady(!!data.session));
        const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setReady(!!s));
        return () => sub.subscription.unsubscribe();
    }, []);

    async function submit(e) {
        e.preventDefault();
        if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return; }
        setBusy(true); setError('');
        const { error } = await supabase.auth.updateUser({ password });
        if (error) { setError(authError(error.message)); setBusy(false); }
        else { setDone(true); setTimeout(() => navigate('/app', { replace: true }), 1500); }
    }

    return (
        <div className="auth-wrap">
            <div className="card auth-card">
                <div className="brand"><Logo size={36} /></div>
                <h1>Nova senha</h1>
                {done ? (
                    <p className="sub"><i className="ti ti-circle-check" style={{ color: 'var(--color-success)' }} /> Senha alterada! Redirecionando…</p>
                ) : !ready ? (
                    <p className="sub">Abra esta página pelo link enviado ao seu email para redefinir a senha.</p>
                ) : (
                    <form onSubmit={submit}>
                        <div className="field">
                            <label>Nova senha</label>
                            <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
                        </div>
                        {error && <div className="notice danger"><i className="ti ti-alert-circle" />{error}</div>}
                        <button className="btn primary block" disabled={busy}>{busy ? 'Salvando…' : 'Salvar nova senha'}</button>
                    </form>
                )}
            </div>
        </div>
    );
}
