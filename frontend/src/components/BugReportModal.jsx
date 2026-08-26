import { useState, useRef, useEffect } from 'react';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';
import { ultimoErro } from '../lib/errorLog.js';

// Canal de relato de bug. Envia junto o CONTEXTO capturado do navegador — rota,
// user agent, tamanho de tela e o último erro de JS da sessão. É isso que
// transforma "não funciona" em algo reproduzível, sem exigir que o usuário saiba
// descrever onde estava nem abrir o console.
//
// O que é enviado fica visível na tela antes de mandar: pedir para relatar um
// problema e mandar dados do navegador sem avisar seria uma surpresa ruim.
export default function BugReportModal({ onClose }) {
    const { t } = useT();
    const [mensagem, setMensagem] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [enviado, setEnviado] = useState(false);
    const [erro, setErro] = useState('');
    const [verContexto, setVerContexto] = useState(false);
    const travaRef = useRef(false);        // anti duplo-clique (convenção do projeto)
    const campoRef = useRef(null);

    useEffect(() => { campoRef.current?.focus(); }, []);
    useEffect(() => {
        const esc = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', esc);
        return () => window.removeEventListener('keydown', esc);
    }, [onClose]);

    const contexto = {
        page: location.pathname + location.search,
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        appError: ultimoErro(),
    };

    async function enviar(e) {
        e.preventDefault();
        if (travaRef.current) return;
        if (mensagem.trim().length < 10) { setErro(t('Descreva o problema com um pouco mais de detalhe.')); return; }
        travaRef.current = true;
        setEnviando(true); setErro('');
        try {
            await api.reportBug({ message: mensagem.trim(), ...contexto });
            setEnviado(true);
        } catch (err) {
            setErro(err?.message || t('Não foi possível enviar. Tente de novo.'));
            travaRef.current = false;
        } finally {
            setEnviando(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal bug-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t('Relatar um problema')}>
                {enviado ? (
                    <div style={{ textAlign: 'center', padding: '32px 22px' }}>
                        <div className="bug-ok"><i className="ti ti-check" /></div>
                        <h3 style={{ margin: '14px 0 6px' }}>{t('Relato enviado')}</h3>
                        <p className="muted" style={{ fontSize: 14, marginBottom: 20 }}>
                            {t('Obrigado. Vamos investigar e você pode acompanhar o status em Feedback.')}
                        </p>
                        <button className="btn primary" onClick={onClose}>{t('Fechar')}</button>
                    </div>
                ) : (
                    <form onSubmit={enviar}>
                        <div className="modal-head">
                            <h3><i className="ti ti-bug" /> {t('Relatar um problema')}</h3>
                            <button type="button" className="close" onClick={onClose} aria-label={t('Fechar')}>
                                <i className="ti ti-x" />
                            </button>
                        </div>

                        <div className="modal-body" style={{ padding: '18px 22px' }}>
                        <p className="muted" style={{ fontSize: 13.5, marginTop: 0 }}>
                            {t('O que aconteceu? Se puder, diga o que você estava tentando fazer e o que esperava que acontecesse.')}
                        </p>

                        <textarea
                            ref={campoRef}
                            className="input"
                            rows={5}
                            maxLength={2000}
                            value={mensagem}
                            onChange={(e) => { setMensagem(e.target.value); setErro(''); }}
                            placeholder={t('Ex.: cliquei em "enviar candidaturas" e a tela ficou carregando para sempre.')}
                        />
                        <div className="bug-contador">{mensagem.length}/2000</div>

                        {erro && <div className="notice danger" style={{ marginTop: 10 }}><i className="ti ti-alert-circle" />{erro}</div>}

                        <button type="button" className="bug-ctx-toggle" onClick={() => setVerContexto((v) => !v)}>
                            <i className={`ti ti-chevron-${verContexto ? 'down' : 'right'}`} />
                            {t('Enviamos junto alguns dados técnicos')}
                        </button>
                        {verContexto && (
                            <pre className="bug-ctx">
{`${t('Página')}: ${contexto.page}
${t('Tela')}: ${contexto.viewport}
${t('Navegador')}: ${contexto.userAgent.slice(0, 90)}
${t('Último erro')}: ${contexto.appError || t('nenhum')}`}
                            </pre>
                        )}

                        </div>

                        <div className="modal-foot">
                            <button type="button" className="btn ghost" onClick={onClose}>{t('Cancelar')}</button>
                            <button className="btn primary" disabled={enviando}>
                                {enviando ? t('Enviando…') : <><i className="ti ti-send" /> {t('Enviar relato')}</>}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}
