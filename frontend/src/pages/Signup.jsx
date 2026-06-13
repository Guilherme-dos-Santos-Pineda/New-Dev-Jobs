import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../auth.jsx';
import Logo from '../components/Logo.jsx';
import { authError } from '../lib/authErrors.js';

export default function Signup() {
    const { session } = useAuth();
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sentConfirm, setSentConfirm] = useState(false);

    if (session) { navigate('/app', { replace: true }); return null; }

    async function submit(e) {
        e.preventDefault();
        if (password.length < 6) { setError('A senha deve ter ao menos 6 caracteres.'); return; }
        setBusy(true); setError('');
        const { data, error } = await supabase.auth.signUp({
            email, password,
            options: { data: { name }, emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) { setError(authError(error.message)); setBusy(false); return; }
        if (data.session) navigate('/app', { replace: true }); // confirmação desabilitada
        else { setSentConfirm(true); setBusy(false); } // precisa confirmar por email
    }

    async function google() {
        await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/app` } });
    }

    return (
        <div className="auth-wrap">
            <div className="card auth-card">
                <div className="brand"><Logo size={36} /></div>
                {sentConfirm ? (
                    <>
                        <h1>Confirme seu email</h1>
                        <p className="sub">Enviamos um link de confirmação para <b>{email}</b>. Clique nele para ativar sua conta.</p>
                        <Link to="/login" className="btn block" style={{ marginTop: 12 }}>Voltar ao login</Link>
                    </>
                ) : (
                    <>
                        <h1>Criar conta</h1>
                        <p className="sub">Comece a automatizar suas candidaturas.</p>

                        <button className="btn block" style={{ marginBottom: 16 }} onClick={google} disabled={!supabaseConfigured}>
                            <i className="ti ti-brand-google" /> Continuar com Google
                        </button>
                        <div className="auth-divider"><span>ou</span></div>

                        <form onSubmit={submit}>
                            <div className="field">
                                <label>Nome</label>
                                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
                            </div>
                            <div className="field">
                                <label>Email</label>
                                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                            </div>
                            <div className="field">
                                <label>Senha</label>
                                <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" />
                            </div>
                            {error && <div className="notice danger"><i className="ti ti-alert-circle" />{error}</div>}
                            <button className="btn primary block" disabled={busy || !supabaseConfigured}>
                                {busy ? 'Criando…' : (<><i className="ti ti-user-plus" /> Criar conta</>)}
                            </button>
                        </form>

                        <div className="auth-links">
                            <span>Já tem conta? <Link to="/login">Entrar</Link></span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
