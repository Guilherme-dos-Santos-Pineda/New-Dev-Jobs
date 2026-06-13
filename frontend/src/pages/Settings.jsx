import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';

const GOOGLE_MSG = {
    connected: ['Conta Google conectada com sucesso', 'info'],
    denied: ['Você cancelou a conexão com o Google', 'error'],
    invalid: ['Sessão de conexão expirou, tente de novo', 'error'],
    error: ['Falha ao conectar com o Google', 'error'],
};

export default function EmailSettings() {
    const { user, googleConfigured, refreshUser } = useAuth();
    const toast = useToast();
    const [params, setParams] = useSearchParams();

    // ---- template ----
    const [subject, setSubject] = useState('');
    const [body, setBody] = useState('');
    const [variables, setVariables] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [preview, setPreview] = useState(null);
    const subjectRef = useRef();
    const bodyRef = useRef();
    const activeField = useRef('body');

    const [connecting, setConnecting] = useState(false);
    const [savingMode, setSavingMode] = useState(false);
    const [testTo, setTestTo] = useState('garmecfeels@gmail.com');
    const [testing, setTesting] = useState(false);

    async function sendTest() {
        setTesting(true);
        try {
            const r = await api.sendTestEmail(testTo);
            toast.show(r.provider === 'gmail' ? `Email de teste enviado para ${r.to}!` : `Email simulado (mock) para ${r.to}`);
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            setTesting(false);
        }
    }

    // Trata retorno do OAuth (?google=...)
    useEffect(() => {
        const g = params.get('google');
        if (g && GOOGLE_MSG[g]) {
            const [msg, type] = GOOGLE_MSG[g];
            toast.show(msg, type);
            refreshUser();
            params.delete('google');
            setParams(params, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        (async () => {
            const { template, variables } = await api.getTemplate('pt');
            setSubject(template.subject);
            setBody(template.body);
            setVariables(variables);
            setLoading(false);
        })();
    }, []);

    // Preview ao vivo (debounce)
    const runPreview = useCallback(async (subj, bd) => {
        try {
            const { preview } = await api.previewApplication({ subject: subj, body: bd });
            setPreview(preview);
        } catch { /* ignora */ }
    }, []);
    useEffect(() => {
        if (loading) return;
        const t = setTimeout(() => runPreview(subject, body), 350);
        return () => clearTimeout(t);
    }, [subject, body, loading, runPreview]);

    // Envolve a seleção do corpo com marcadores (**negrito** / *itálico*)
    function wrapFormat(marker) {
        const el = bodyRef.current;
        if (!el) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        const sel = body.slice(start, end) || 'texto';
        const next = body.slice(0, start) + marker + sel + marker + body.slice(end);
        setBody(next);
        requestAnimationFrame(() => {
            el.focus();
            el.setSelectionRange(start + marker.length, start + marker.length + sel.length);
        });
    }

    function insertVar(token) {
        const isSubject = activeField.current === 'subject';
        const el = isSubject ? subjectRef.current : bodyRef.current;
        const value = isSubject ? subject : body;
        const set = isSubject ? setSubject : setBody;
        const start = el?.selectionStart ?? value.length;
        const end = el?.selectionEnd ?? value.length;
        const next = value.slice(0, start) + token + value.slice(end);
        set(next);
        requestAnimationFrame(() => {
            el?.focus();
            const pos = start + token.length;
            el?.setSelectionRange(pos, pos);
        });
    }

    async function save() {
        setSaving(true);
        try {
            await api.saveTemplate({ lang: 'pt', subject, body });
            toast.show('Template salvo');
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            setSaving(false);
        }
    }
    async function resetTpl() {
        const { template } = await api.resetTemplate('pt');
        setSubject(template.subject);
        setBody(template.body);
        toast.show('Template restaurado para o padrão');
    }

    async function connectGoogle() {
        setConnecting(true);
        try {
            if (googleConfigured) {
                const { url } = await api.googleAuthUrl();
                window.location.href = url; // redireciona ao consentimento
            } else {
                await api.connectGoogle(); // fallback mock
                await refreshUser();
                toast.show('Conta conectada (mock — Google OAuth não configurado)');
            }
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            setConnecting(false);
        }
    }
    async function disconnectGoogle() {
        await api.disconnectGoogle();
        await refreshUser();
        toast.show('Conta Google desconectada');
    }

    async function setMode(mode) {
        if (mode === user.sendMode) return;
        setSavingMode(true);
        try {
            await api.updateSettings({ sendMode: mode });
            await refreshUser();
        } finally {
            setSavingMode(false);
        }
    }

    if (loading) return <div className="center" style={{ padding: 40 }}><div className="spinner" /></div>;

    return (
        <>
            {/* ---- Conexão Google ---- */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title">Conta de envio (Gmail)</div>
                {!googleConfigured && (
                    <div className="notice warn">
                        <i className="ti ti-alert-triangle" />
                        <div>Google OAuth ainda não configurado no servidor — os emails são <b>simulados</b>.
                            Veja <a href="https://console.cloud.google.com" target="_blank" rel="noopener">o guia</a> em <code>backend/SETUP_GOOGLE.md</code>.</div>
                    </div>
                )}
                {user.googleConnected ? (
                    <div className="row" style={{ alignItems: 'center' }}>
                        <div className="job-logo" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                            <i className="ti ti-brand-google-filled" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600 }}>{user.googleEmail || 'Conta conectada'}</div>
                            <div className="badge ok" style={{ marginTop: 4 }}><i className="ti ti-circle-check" /> pronta para enviar</div>
                        </div>
                        <div className="spacer" />
                        <button className="btn sm" onClick={disconnectGoogle}><i className="ti ti-unlink" /> Desconectar</button>
                    </div>
                ) : (
                    <div className="row" style={{ alignItems: 'center' }}>
                        <div className="job-logo"><i className="ti ti-brand-google" /></div>
                        <div>
                            <div style={{ fontWeight: 600 }}>Conecte sua conta Google</div>
                            <div className="muted" style={{ fontSize: 12.5 }}>Permissão apenas de envio (gmail.send). Nunca lemos seus emails.</div>
                        </div>
                        <div className="spacer" />
                        <button className="btn primary sm" disabled={connecting} onClick={connectGoogle}>
                            <i className="ti ti-brand-google" /> {connecting ? '…' : 'Conectar Google'}
                        </button>
                    </div>
                )}

                {/* Enviar email de teste */}
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Enviar email de teste</div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                        Envia um email real (com seu template e currículo) para conferir se está tudo certo.
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                        <input className="input" type="email" value={testTo}
                            onChange={(e) => setTestTo(e.target.value)} placeholder="email@destino.com" />
                        <button className="btn sm" style={{ flexShrink: 0 }} disabled={testing || !user.googleConnected}
                            onClick={sendTest}>
                            <i className="ti ti-send" /> {testing ? 'Enviando…' : 'Enviar teste'}
                        </button>
                    </div>
                    {!user.googleConnected && <div className="hint">Conecte sua conta Google para enviar o teste.</div>}
                </div>
            </div>

            {/* ---- Modo de envio ---- */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div className="section-title">Ao se candidatar</div>
                <div className="row" style={{ gap: 12 }}>
                    {[
                        { v: 'review', icon: 'ti-eye-check', t: 'Revisar antes de enviar', d: 'Mostra o email pronto e você confirma o envio.' },
                        { v: 'auto', icon: 'ti-bolt', t: 'Enviar automaticamente', d: 'Envia direto ao clicar em candidatar.' },
                    ].map((o) => (
                        <button key={o.v} type="button" disabled={savingMode} onClick={() => setMode(o.v)}
                            className="card hoverable" style={{
                                flex: 1, minWidth: 220, textAlign: 'left', cursor: 'pointer',
                                borderColor: user.sendMode === o.v ? 'var(--color-accent)' : 'var(--color-border-light)',
                                boxShadow: user.sendMode === o.v ? '0 0 0 3px color-mix(in srgb, var(--color-accent) 16%, transparent)' : 'none',
                                background: 'var(--color-surface)',
                            }}>
                            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                                <i className={`ti ${o.icon}`} style={{ fontSize: 20, color: 'var(--color-accent)' }} />
                                <span style={{ fontWeight: 600 }}>{o.t}</span>
                                {user.sendMode === o.v && <i className="ti ti-circle-check-filled" style={{ marginLeft: 'auto', color: 'var(--color-accent)' }} />}
                            </div>
                            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{o.d}</div>
                        </button>
                    ))}
                </div>
            </div>

            {/* ---- Editor de template ---- */}
            <div className="card">
                <div className="row" style={{ alignItems: 'center', marginBottom: 4 }}>
                    <div className="section-title" style={{ margin: 0 }}>Modelo do email</div>
                    <div className="spacer" />
                    <select className="select" style={{ width: 'auto' }} value="pt" disabled>
                        <option value="pt">Português</option>
                    </select>
                </div>
                <p className="muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
                    Personalize o assunto e o corpo. Use as variáveis (clique para inserir).
                </p>

                <div className="grid-2" style={{ alignItems: 'start' }}>
                    {/* Coluna editor */}
                    <div>
                        <div className="field">
                            <label>Assunto</label>
                            <input ref={subjectRef} className="input mono" value={subject}
                                onFocus={() => (activeField.current = 'subject')}
                                onChange={(e) => setSubject(e.target.value)} />
                        </div>
                        <div className="field">
                            <div className="row" style={{ alignItems: 'center', marginBottom: 7 }}>
                                <label style={{ margin: 0 }}>Corpo do email</label>
                                <div className="spacer" />
                                <button type="button" className="fmt-btn" title="Negrito (**texto**)" onClick={() => wrapFormat('**')}><i className="ti ti-bold" /></button>
                                <button type="button" className="fmt-btn" title="Itálico (*texto*)" onClick={() => wrapFormat('*')}><i className="ti ti-italic" /></button>
                            </div>
                            <textarea ref={bodyRef} className="input mono" rows={12} value={body}
                                onFocus={() => (activeField.current = 'body')}
                                onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.6 }} />
                        </div>

                        <div className="field">
                            <label>Variáveis disponíveis</label>
                            <div className="chips">
                                {variables.map((v) => (
                                    <span key={v.key} className="chip" title={v.desc} style={{ cursor: 'pointer' }}
                                        onClick={() => insertVar(v.label)}>
                                        <i className="ti ti-plus" style={{ fontSize: 12 }} />{v.label}
                                    </span>
                                ))}
                            </div>
                            <div className="hint">
                                {variables.map((v) => <div key={v.key}><code>{v.label}</code> — {v.desc}</div>)}
                            </div>
                        </div>

                        <div className="row">
                            <button className="btn primary" disabled={saving} onClick={save}>
                                {saving ? 'Salvando…' : (<><i className="ti ti-device-floppy" /> Salvar modelo</>)}
                            </button>
                            <button className="btn ghost" onClick={resetTpl}><i className="ti ti-restore" /> Restaurar padrão</button>
                        </div>
                    </div>

                    {/* Coluna preview */}
                    <div>
                        <label className="field" style={{ display: 'block' }}>Pré-visualização</label>
                        <div className="mailprev">
                            <div className="mailprev-bar">
                                <span className="dot" /><span className="dot" /><span className="dot" />
                                <span className="app"><i className="ti ti-brand-gmail" /> Gmail</span>
                            </div>
                            <div className="mailprev-meta">
                                <div className="mailprev-from">
                                    <div className="avatar">{(preview?.fromName || preview?.from || '?').slice(0, 1).toUpperCase()}</div>
                                    <div>
                                        <div className="nm">{preview?.fromName || 'Você'}</div>
                                        <div className="em">{preview?.from || '—'}</div>
                                    </div>
                                </div>
                                <div className="mailprev-to">para <b>{preview?.to || '—'}</b></div>
                                <div className="mailprev-subj">{preview?.subject || '—'}</div>
                            </div>
                            <div className="mailprev-body" dangerouslySetInnerHTML={{ __html: preview?.html || '' }} />
                            {preview?.attachment && (
                                <div className="mailprev-attach"><i className="ti ti-file-type-pdf" /> {preview.attachment}</div>
                            )}
                        </div>
                        <div className="hint">Exemplo com uma vaga fictícia e seus dados de contato.</div>
                    </div>
                </div>
            </div>
        </>
    );
}
