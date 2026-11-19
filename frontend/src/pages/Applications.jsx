import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { useToast } from '../components/Toast.jsx';
import { scoreClass, fmtDate } from '../utils.js';

const PAGE_SIZE = 12;

const STATUS = {
    sent: { label: 'Enviado', icon: 'ti-circle-check', tom: 'ok' },
    failed: { label: 'Falhou', icon: 'ti-alert-triangle', tom: 'danger' },
    skipped: { label: 'Pulado', icon: 'ti-player-skip-forward', tom: 'neutro' },
    queued: { label: 'Na fila', icon: 'ti-clock', tom: 'neutro' },
    manual: { label: 'Aberto no Gmail', icon: 'ti-external-link', tom: 'neutro' },
};

// Filtro simples de Enviadas (19/11/2026): status e busca por vaga, empresa ou email.
const FILTROS = [['', 'Todas'], ['enviado', 'Enviadas'], ['manual', 'Abertas no Gmail'], ['falhou', 'Falharam'], ['pulado', 'Puladas']];

// =========================
// Candidaturas
// =========================
// Lista em LINHAS, não em cartões soltos. Cada candidatura tem os mesmos cinco
// campos (vaga, empresa, quando, para quem, match), e cartao solto esconde essa
// regularidade: o olho nao consegue comparar dois cartoes que nao se alinham.
// Numa lista alinhada, "qual foi a de maior match" se responde percorrendo uma
// coluna.

export default function Applications() {
    const { t } = useT();
    const [page, setPage] = useState(1);
    const [status, setStatus] = useState('');
    const [busca, setBusca] = useState('');
    const [q, setQ] = useState('');
    // Espera a pessoa parar de digitar: uma consulta por busca, não por letra.
    useEffect(() => { const id = setTimeout(() => { setQ(busca.trim()); setPage(1); }, 400); return () => clearTimeout(id); }, [busca]);
    const { data, loading, refresh: reload } = useCachedResource(`applications:${page}:${status}:${q}`, () => api.getApplications({ page, pageSize: PAGE_SIZE, status, q }));
    const filtrando = !!(status || q);
    const apps = data?.applications || [];
    const total = data?.total ?? apps.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const [open, setOpen] = useState(null);

    return (
        <div className="page">
            <div className="page-head row" style={{ alignItems: 'flex-start' }}>
                <div>
                    <h1>{t('Enviadas')}</h1>
                    <p>{t('Tudo que você já mandou, e para quem.')}</p>
                </div>
                <div className="spacer" />
                {!loading && total > 0 && (
                    <span className="pill-contagem">{total} {t('no total')}</span>
                )}
            </div>

            <div className="card vl-filtros" style={{ marginBottom: 12 }}>
                <div className="vl-busca">
                    <i className="ti ti-search" />
                    <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)}
                        placeholder={t('Buscar por vaga, empresa ou email')} aria-label={t('Buscar por vaga, empresa ou email')} />
                </div>
                <div className="chips" role="group" aria-label={t('Status')} style={{ marginTop: 10 }}>
                    {FILTROS.map(([v, l]) => (
                        <button key={v || 'todas'} type="button" className={`chip toggle ${status === v ? 'on' : ''}`}
                            onClick={() => { setStatus(v); setPage(1); }}>{t(l)}</button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="lista">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 'var(--radius)' }} />)}</div>
            ) : apps.length === 0 && filtrando ? (
                <div className="card empty">
                    <i className="ti ti-filter-off" />
                    {t('Nada com esse filtro.')}
                </div>
            ) : apps.length === 0 ? (
                <div className="card empty">
                    <i className="ti ti-send" />
                    {t('Você ainda não mandou seu currículo para nenhuma vaga.')}
                    <div style={{ marginTop: 14 }}><Link to="/app" className="btn primary sm"><i className="ti ti-briefcase" /> {t('Ver as vagas')}</Link></div>
                </div>
            ) : (
                <div className="card lista-card">
                    {apps.map((a) => {
                        const st = STATUS[a.status] || STATUS.sent;
                        return (
                            <button key={a.id} type="button" className="linha" onClick={() => setOpen(a)}>
                                <span className={`linha-ico ${st.tom}`}><i className={`ti ${st.icon}`} /></span>

                                <span className="linha-txt">
                                    <span className="linha-titulo">{a.title || t('Vaga')}</span>
                                    <span className="linha-sub">
                                        {a.company ? `${a.company} · ` : ''}{fmtDate(a.sentAt || a.createdAt)}
                                    </span>
                                </span>

                                {/* Só no desktop: no celular a linha já está cheia. */}
                                <span className="linha-para">{a.to || ''}</span>

                                <span className={`score ${scoreClass(a.matchScore)}`}>{a.matchScore}%</span>
                                <i className="ti ti-chevron-right linha-seta" />
                            </button>
                        );
                    })}
                </div>
            )}

            {!loading && total > PAGE_SIZE && (
                <div className="row" style={{ alignItems: 'center', marginTop: 16 }}>
                    <span className="muted" style={{ fontSize: 12 }}>{t('página')} {page}/{totalPages}</span>
                    <div className="spacer" />
                    <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><i className="ti ti-chevron-left" /> {t('anterior')}</button>
                    <button className="btn ghost sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('próxima')} <i className="ti ti-chevron-right" /></button>
                </div>
            )}

            {open && <DetalheCandidatura a={open} onClose={() => setOpen(null)} t={t} onAvisou={() => reload?.()} />}
        </div>
    );
}

// Os mesmos campos, sempre na mesma ordem, com rótulo em cima. É o formato que
// você apontou como bonito, e ele funciona porque o rótulo responde "o que é
// isso" antes de a pessoa precisar deduzir pelo conteúdo.
function DetalheCandidatura({ a, onClose, t, onAvisou }) {
    const st = STATUS[a.status] || STATUS.sent;
    const toast = useToast();
    const [copiado, setCopiado] = useState(false);
    const [voltou, setVoltou] = useState(!!a.emailVoltou);
    const [confirmando, setConfirmando] = useState(false);
    const trava = useRef(false);
    // Só para envio pelo Gmail: é quem recebe o "endereço não encontrado".
    const podeAvisar = a.status === 'sent' && !!a.to;
    async function avisarVoltou() {
        if (trava.current) return;
        trava.current = true;
        try {
            const r = await api.emailVoltou(a.id);
            setVoltou(true);
            setConfirmando(false);
            toast.show(r.bloqueados?.length
                ? t('Obrigado! Esse email saiu da lista de todo mundo.')
                : t('Obrigado! Quando mais alguém avisar, esse email sai da lista de todo mundo.'));
            onAvisou?.();
        } catch (e) { toast.show(e.message, 'error'); }
        finally { trava.current = false; }
    }
    async function copiarLink() {
        try {
            await navigator.clipboard.writeText(a.postUrl);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        } catch {
            // Sem permissão de área de transferência: abre o post, de onde dá para copiar.
            window.open(a.postUrl, '_blank', 'noopener');
        }
    }
    const campos = [
        { rotulo: t('Enviado em'), valor: fmtDate(a.sentAt || a.createdAt) },
        { rotulo: t('Status'), valor: t(st.label), tom: st.tom },
        { rotulo: t('Email destinatário'), valor: a.to || '' },
        { rotulo: t('Idioma / template'), valor: a.lang ? `${a.lang.toUpperCase()} · ${a.template || 'job_inquiry'}` : 'PT · job_inquiry' },
        { rotulo: t('Currículo enviado'), valor: a.cvVersao ? t('Versão da IA: {nome}', { nome: a.cvVersao }) : t('O do seu perfil'), tom: a.cvVersao ? 'ok' : '' },
    ];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal det" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
                <div className="det-topo">
                    <div style={{ minWidth: 0 }}>
                        <h3>{a.title || t('Vaga')}</h3>
                        {a.company && <p className="muted">{a.company}</p>}
                    </div>
                    <button className="close" onClick={onClose} aria-label={t('Fechar')}><i className="ti ti-x" /></button>
                </div>

                <div className="det-campos">
                    {campos.map((c) => (
                        <div key={c.rotulo} className="det-campo">
                            <span className="det-rotulo">{c.rotulo}</span>
                            <span className={`det-valor ${c.tom || ''}`}>{c.valor}</span>
                        </div>
                    ))}
                    <div className="det-campo larga">
                        <span className="det-rotulo">{t('Assunto do email')}</span>
                        <span className="det-valor">{a.subject || t('sem assunto')}</span>
                    </div>
                </div>

                {/* Em cima, antes da descrição: no fim do detalhe ninguém achava (relato de
                    11/11/2026, a recrutadora pediu o link do post e a pessoa não viu o botão). */}
                {a.postUrl ? (
                    <div className="det-secao det-post">
                        <a className="btn sm primary" href={a.postUrl} target="_blank" rel="noopener noreferrer">
                            <i className={`ti ${/github\.com/.test(a.postUrl) ? 'ti-brand-github' : 'ti-brand-linkedin'}`} /> {/github\.com/.test(a.postUrl) ? t('Ver a vaga no GitHub') : t('Ver o post no LinkedIn')}
                        </a>
                        <button type="button" className="btn sm" onClick={copiarLink}>
                            <i className={`ti ${copiado ? 'ti-check' : 'ti-copy'}`} /> {copiado ? t('Link copiado') : t('Copiar link do post')}
                        </button>
                    </div>
                ) : a.buscaUrl && (
                    // Vaga de antes de o link do post ser guardado (julho a setembro de
                    // 2026, ~1/3 dos envios): a busca do LinkedIn por cargo e empresa
                    // costuma achar o post (relato de usuário, 12/11/2026).
                    <div className="det-secao det-post">
                        <a className="btn sm" href={a.buscaUrl} target="_blank" rel="noopener noreferrer">
                            <i className="ti ti-search" /> {t('Procurar o post no LinkedIn')}
                        </a>
                        <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>{t('O link do post desta vaga não foi guardado.')}</span>
                    </div>
                )}

                {podeAvisar && (
                    <div className="det-secao det-voltou">
                        {voltou ? (
                            <span className="muted" style={{ fontSize: 13 }}><i className="ti ti-mail-off" /> {t('Você avisou que este email voltou. Valeu!')}</span>
                        ) : confirmando ? (<>
                            <span style={{ fontSize: 13 }}>{t('Você recebeu no seu Gmail um aviso de que este endereço não existe ("Endereço não encontrado")?')}</span>
                            <div className="row" style={{ gap: 8, marginTop: 8 }}>
                                <button className="btn sm danger" onClick={avisarVoltou}>{t('Sim, o email voltou')}</button>
                                <button className="btn sm ghost" onClick={() => setConfirmando(false)}>{t('Cancelar')}</button>
                            </div>
                        </>) : (
                            <button className="link-sutil" onClick={() => setConfirmando(true)}><i className="ti ti-mail-off" /> {t('Esse email voltou (endereço não existe)')}</button>
                        )}
                    </div>
                )}

                {a.description && (
                    <div className="det-secao">
                        <span className="det-rotulo">{t('Descrição da vaga')}</span>
                        <div className="det-descricao">{a.description}</div>
                    </div>
                )}

                <div className="det-rodape">
                    <div className="det-match">
                        <span className="det-rotulo">{t('Match score')}</span>
                        <span className={`det-score ${scoreClass(a.matchScore)}`}>{a.matchScore}%</span>
                    </div>
                </div>

                <div className="det-acoes">
                    <Link to="/app/feedback" className="btn ghost sm">{t('Reportar vaga')}</Link>
                    <div className="spacer" />
                    <button className="btn" onClick={onClose}>{t('Fechar')}</button>
                </div>
            </div>
        </div>
    );
}
