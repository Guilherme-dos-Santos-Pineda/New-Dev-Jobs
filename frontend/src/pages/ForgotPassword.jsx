import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import Logo from '../components/Logo.jsx';
import { authError } from '../lib/authErrors.js';

export default function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [sent, setSent] = useState(false);

    async function submit(e) {
        e.preventDefault();
        setBusy(true); setError('');
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset`,
        });
        if (error) { setError(authError(error.message)); setBusy(false); }
        else setSent(true);
    }

    return (
        <div className="auth-wrap">
            <div className="card auth-card">
                <div className="brand"><Logo size={36} /></div>
                {sent ? (
                    <>
                        <h1>Verifique seu email</h1>
                        <p className="sub">Se existe uma conta para <b>{email}</b>, enviamos um link para redefinir a senha.</p>
                        <Link to="/login" className="btn block" style={{ marginTop: 12 }}>Voltar ao login</Link>
                    </>
                ) : (
                    <>
                        <h1>Esqueci a senha</h1>
                        <p className="sub">Informe seu email e enviaremos um link para redefinir.</p>
                        <form onSubmit={submit}>
                            <div className="field">
                                <label>Email</label>
                                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com" />
                            </div>
                            {error && <div className="notice danger"><i className="ti ti-alert-circle" />{error}</div>}
                            <button className="btn primary block" disabled={busy}>
                                {busy ? 'Enviando…' : (<><i className="ti ti-mail" /> Enviar link</>)}
                            </button>
                        </form>
                        <div className="auth-links"><Link to="/login">Voltar ao login</Link></div>
                    </>
                )}
            </div>
            <div className="auth-foot">
                <a href="https://landing.newdevjobs.xyz/privacidade.html" target="_blank" rel="noopener">Política de Privacidade</a>
                <span>·</span>
                <a href="https://landing.newdevjobs.xyz/termos.html" target="_blank" rel="noopener">Termos de Uso</a>
            </div>
        </div>
    );
}
