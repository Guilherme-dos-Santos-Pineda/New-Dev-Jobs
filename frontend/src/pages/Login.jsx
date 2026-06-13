import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../auth.jsx';
import Logo from '../components/Logo.jsx';
import { authError } from '../lib/authErrors.js';

export default function Login() {
    const { session } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    if (session) { navigate('/app', { replace: true }); return null; }

    async function submit(e) {
        e.preventDefault();
        setBusy(true); setError('');
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) { setError(authError(error.message)); setBusy(false); }
        else navigate('/app', { replace: true });
    }

    async function google() {
        setError('');
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/app` },
        });
        if (error) setError(authError(error.message));
    }

    return (
        <div className="auth-wrap">
            <div className="card auth-card">
                <div className="brand"><Logo size={36} /></div>
                <h1>Entrar</h1>
                <p className="sub">Acesse seu painel de candidaturas automáticas.</p>

                {!supabaseConfigured && <div className="notice danger"><i className="ti ti-alert-circle" />Supabase não configurado (veja frontend/.env).</div>}

                <button className="btn block" style={{ marginBottom: 16 }} onClick={google} disabled={!supabaseConfigured}>
                    <i className="ti ti-brand-google" /> Continuar com Google
                </button>
                <div className="auth-divider"><span>ou</span></div>

                <form onSubmit={submit}>
                    <div className="field">
                        <label>Email</label>
                        <input className="input" type="email" required value={email}
                            onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                    </div>
                    <div className="field">
                        <label>Senha</label>
                        <input className="input" type="password" required value={password}
                            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                    {error && <div className="notice danger"><i className="ti ti-alert-circle" />{error}</div>}
                    <button className="btn primary block" disabled={busy || !supabaseConfigured}>
                        {busy ? 'Entrando…' : (<><i className="ti ti-login" /> Entrar</>)}
                    </button>
                </form>

                <div className="auth-links">
                    <Link to="/forgot">Esqueci minha senha</Link>
                    <span>Não tem conta? <Link to="/signup">Cadastre-se</Link></span>
                </div>
            </div>
        </div>
    );
}
