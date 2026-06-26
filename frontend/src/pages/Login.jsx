import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, supabaseConfigured } from '../lib/supabase.js';
import { useAuth } from '../auth.jsx';
import Logo from '../components/Logo.jsx';
import { authError } from '../lib/authErrors.js';
import { useT } from '../lib/i18n.jsx';

export default function Login() {
    const { session } = useAuth();
    const { t } = useT();
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
                <h1>{t('Entrar')}</h1>
                <p className="sub">{t('Acesse seu painel de candidaturas automáticas.')}</p>

                {!supabaseConfigured && <div className="notice danger"><i className="ti ti-alert-circle" />{t('Supabase não configurado (veja frontend/.env).')}</div>}

                <button className="btn block" style={{ marginBottom: 16 }} onClick={google} disabled={!supabaseConfigured}>
                    <i className="ti ti-brand-google" /> {t('Continuar com Google')}
                </button>
                <div className="auth-divider"><span>{t('ou')}</span></div>

                <form onSubmit={submit}>
                    <div className="field">
                        <label>{t('Email')}</label>
                        <input className="input" type="email" required value={email}
                            onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                    </div>
                    <div className="field">
                        <label>{t('Senha')}</label>
                        <input className="input" type="password" required value={password}
                            onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                    {error && <div className="notice danger"><i className="ti ti-alert-circle" />{error}</div>}
                    <button className="btn primary block" disabled={busy || !supabaseConfigured}>
                        {busy ? t('Entrando…') : (<><i className="ti ti-login" /> {t('Entrar')}</>)}
                    </button>
                </form>

                <div className="auth-links">
                    <Link to="/forgot">{t('Esqueci minha senha')}</Link>
                    <span>{t('Não tem conta?')} <Link to="/signup">{t('Cadastre-se')}</Link></span>
                </div>
            </div>

            {/* Exigido pela verificação do Google: a página inicial precisa linkar a Política de Privacidade. */}
            <div className="auth-foot">
                <a href="https://landing.newdevjobs.xyz/privacidade.html" target="_blank" rel="noopener">{t('Política de Privacidade')}</a>
                <span>·</span>
                <a href="https://landing.newdevjobs.xyz/termos.html" target="_blank" rel="noopener">{t('Termos de Uso')}</a>
            </div>
        </div>
    );
}
