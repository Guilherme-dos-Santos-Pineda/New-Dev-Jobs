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

// =========================
// Bloco que recolhe no celular
// =========================
// Medido nesta aba, num celular de 800px de altura: 2.416px de conteúdo, três
// telas de rolagem. O editor de modelo sozinho é 1.876px disso, e ele é a parte
// que menos gente precisa: existe um modelo padrão que funciona, e mexer em
// assunto e corpo de email no celular é trabalho que quase ninguém faz.
//
// Aberto por padrão no desktop, fechado no celular. A decisão é tomada UMA vez,
// na montagem, e não num listener de resize: quem gira o telefone não espera
// que a seção feche sozinha no meio da edição.
function Recolhivel({ titulo, resumo, children }) {
    const [aberto, setAberto] = useState(() => {
        try { return window.innerWidth > 760; } catch { return true; }
    });
    return (
        <details className="recolhivel card" open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
            <summary>
                <span className="recolhivel-t">{titulo}</span>
                {resumo && <span className="recolhivel-r">{resumo}</span>}
                <i className="ti ti-chevron-down recolhivel-seta" aria-hidden="true" />
            </summary>
            <div className="recolhivel-corpo">{children}</div>
        </details>
    );
}

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
    const [disconnecting, setDisconnecting] = useState(false);
    const [testTo, setTestTo] = useState('');
    const [testing, setTesting] = useState(false);
    const busyRef = useRef({}); // travas síncronas anti duplo-clique por ação

    async function sendTest() {
        if (busyRef.current.test) return; // bloqueia envio duplicado de email de teste
        busyRef.current.test = true;
        setTesting(true);
        try {
            const r = await api.sendTestEmail(testTo);
            toast.show(r.provider === 'gmail' ? `Email de teste enviado para ${r.to}!` : `Email simulado (mock) para ${r.to}`);
        } catch (e) {
            toast.show(e.message, 'error');
            if (e.status === 409) refreshUser(); // conexão Google expirou → atualiza UI p/ reconectar
        } finally {
            busyRef.current.test = false;
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
        if (busyRef.current.connect) return; // evita abrir 2 redirects de consentimento
        busyRef.current.connect = true;
        setConnecting(true);
        try {
            if (googleConfigured) {
                const { url } = await api.googleAuthUrl();
                window.location.href = url; // redireciona ao consentimento
            } else {
                await api.connectGoogle(); // fallback mock
                await refreshUser();
                toast.show('Conta conectada (mock: Google OAuth não configurado)');
            }
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            busyRef.current.connect = false;
            setConnecting(false);
        }
    }
    async function disconnectGoogle() {
        if (busyRef.current.disc) return;
        busyRef.current.disc = true;
        setDisconnecting(true);
        try {
            await api.disconnectGoogle();
            await refreshUser();
            toast.show('Conta Google desconectada');
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            busyRef.current.disc = false;
            setDisconnecting(false);
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
                        <div>Google OAuth ainda não configurado no servidor, então os emails são <b>simulados</b>.
                            Veja <a href="https://console.cloud.google.com" target="_blank" rel="noopener">o guia</a> em <code>backend/SETUP_GOOGLE.md</code>.</div>
                    </div>
                )}
                {user.googleConnected ? (
                    <div className="row conta-envio" style={{ alignItems: 'center' }}>
                        <div className="job-logo" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                            <i className="ti ti-brand-google" />
                        </div>
                        <div>
                            <div style={{ fontWeight: 600 }}>{user.googleEmail || 'Conta conectada'}</div>
                            <div className="badge ok" style={{ marginTop: 4 }}><i className="ti ti-circle-check" /> pronta para enviar</div>
                        </div>
                        <div className="spacer" />
                        <button className="btn sm" disabled={disconnecting} onClick={disconnectGoogle}><i className="ti ti-unlink" /> {disconnecting ? 'Desconectando…' : 'Desconectar'}</button>
                    </div>
                ) : (
                    <div className="row conta-envio" style={{ alignItems: 'center' }}>
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

                {/* Selo de confiança — legítimo: o app OAuth passou pela verificação do Google */}
                <a className="google-verified" href="https://support.google.com/cloud/answer/13463073" target="_blank" rel="noopener"
                    title="Este app passou pela verificação de segurança do Google (OAuth). Acesso restrito ao envio (gmail.send).">
                    <i className="ti ti-brand-google" aria-hidden="true" />
                    <span><b>App verificado pelo Google</b><br /><span className="gv-sub">Acesso restrito a envio · nunca lemos seus emails</span></span>
                    <i className="ti ti-discount-check gv-check" aria-hidden="true" />
                </a>

                {/* Enviar email de teste */}
                <div className="teste-envio">
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Enviar email de teste</div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
                        Envia um email real (com seu template e currículo) para conferir se está tudo certo.
                    </div>
                    <div className="row teste-envio-linha" style={{ gap: 8 }}>
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

            {/* ---- Editor de template ---- */}
            <Recolhivel titulo="Modelo do email" resumo="assunto, corpo e variáveis">
                <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
                    <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
                        Personalize o assunto e o corpo. Use as variáveis (clique para inserir).
                    </p>
                    <div className="spacer" />
                    <select className="select" style={{ width: 'auto' }} value="pt" disabled>
                        <option value="pt">Português</option>
                    </select>
                </div>

                <div className="grid-2 tpl-grid" style={{ alignItems: 'start' }}>
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
                                <button type="button" className="fmt-btn b" title="Negrito: envolve a seleção com **" onClick={() => wrapFormat('**')}>B</button>
                                <button type="button" className="fmt-btn i" title="Itálico: envolve a seleção com *" onClick={() => wrapFormat('*')}>I</button>
                            </div>
                            <textarea ref={bodyRef} className="input mono" rows={14} value={body}
                                onFocus={() => (activeField.current = 'body')}
                                onChange={(e) => setBody(e.target.value)} style={{ resize: 'vertical', lineHeight: 1.6 }} />
                            {/* Sem esta linha os dois botões B/I são a única pista de
                                que o corpo aceita formatação — e um botão sem legenda
                                não ensina ninguém. */}
                            <div className="hint">
                                Selecione um trecho e use <b>B</b> ou <i>I</i>. Também dá para escrever
                                {' '}<code>**negrito**</code> e <code>*itálico*</code> na mão. Linha em branco separa parágrafos.
                            </div>
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
                                        <div className="em">{preview?.from || 'seu email'}</div>
                                    </div>
                                </div>
                                <div className="mailprev-to">para <b>{preview?.to || 'o recrutador'}</b></div>
                                <div className="mailprev-subj">{preview?.subject || 'sem assunto'}</div>
                            </div>
                            <div className="mailprev-body" dangerouslySetInnerHTML={{ __html: preview?.html || '' }} />
                            {preview?.attachment && (
                                <div className="mailprev-attach"><i className="ti ti-file-type-pdf" /> {preview.attachment}</div>
                            )}
                        </div>
                        <div className="hint">Exemplo com uma vaga fictícia e seus dados de contato.</div>
                    </div>
                </div>

                    {/* Cada variável é UM item que já se explica. Antes eram os 8
                        chips e, logo abaixo, os MESMOS 8 repetidos como texto
                        corrido — a descrição ficava longe do botão que ela
                        descrevia, e o bloco virava uma parede de letra miúda no
                        meio do editor. Agora a explicação está dentro do próprio
                        alvo de clique. */}
                    <div className="field tpl-vars">
                        <label>
                            Variáveis disponíveis
                            <span className="muted" style={{ fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                                (clique para inserir onde o cursor está)
                            </span>
                        </label>
                        <div className="var-grid">
                            {variables.map((v) => (
                                <button type="button" key={v.key} className="var-item" onClick={() => insertVar(v.label)}>
                                    <code>{v.label}</code>
                                    <span>{v.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                {/* As ações ficam FORA das duas colunas, atravessando o cartão. Dentro
                    da coluna do editor elas apareciam na metade esquerda, na altura do
                    meio da pré-visualização — parecia botão de uma subseção, não o
                    "salvar" do modelo inteiro. */}
                <div className="tpl-acoes">
                    <button className="btn ghost" onClick={resetTpl}><i className="ti ti-restore" /> Restaurar padrão</button>
                    <div className="spacer" />
                    <button className="btn primary" disabled={saving} onClick={save}>
                        {saving ? 'Salvando…' : (<><i className="ti ti-device-floppy" /> Salvar modelo</>)}
                    </button>
                </div>
            </Recolhivel>
        </>
    );
}
