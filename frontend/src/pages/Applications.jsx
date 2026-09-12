import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { scoreClass, fmtDate } from '../utils.js';

const PAGE_SIZE = 12;

const STATUS = {
    sent: { label: 'Enviado', icon: 'ti-circle-check', tom: 'ok' },
    failed: { label: 'Falhou', icon: 'ti-alert-triangle', tom: 'danger' },
    skipped: { label: 'Pulado', icon: 'ti-player-skip-forward', tom: 'neutro' },
    queued: { label: 'Na fila', icon: 'ti-clock', tom: 'neutro' },
};

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
    const { data, loading } = useCachedResource(`applications:${page}`, () => api.getApplications({ page, pageSize: PAGE_SIZE }));
    const apps = data?.applications || [];
    const total = data?.total ?? apps.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const [open, setOpen] = useState(null);

    return (
        <div className="page">
            <div className="page-head row" style={{ alignItems: 'flex-start' }}>
                <div>
                    <h1>{t('Candidaturas')}</h1>
                    <p>{t('Histórico de currículos enviados automaticamente.')}</p>
                </div>
                <div className="spacer" />
                {!loading && total > 0 && (
                    <span className="pill-contagem">{total} {t('no total')}</span>
                )}
            </div>

            {loading ? (
                <div className="lista">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 'var(--radius)' }} />)}</div>
            ) : apps.length === 0 ? (
                <div className="card empty">
                    <i className="ti ti-send" />
                    {t('Você ainda não se candidatou a nenhuma vaga.')}
                    <div style={{ marginTop: 14 }}><Link to="/app" className="btn primary sm"><i className="ti ti-radar-2" /> {t('Procurar vagas')}</Link></div>
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

            {open && <DetalheCandidatura a={open} onClose={() => setOpen(null)} t={t} />}
        </div>
    );
}

// Os mesmos campos, sempre na mesma ordem, com rótulo em cima. É o formato que
// você apontou como bonito, e ele funciona porque o rótulo responde "o que é
// isso" antes de a pessoa precisar deduzir pelo conteúdo.
function DetalheCandidatura({ a, onClose, t }) {
    const st = STATUS[a.status] || STATUS.sent;
    const campos = [
        { rotulo: t('Enviado em'), valor: fmtDate(a.sentAt || a.createdAt) },
        { rotulo: t('Status'), valor: t(st.label), tom: st.tom },
        { rotulo: t('Email destinatário'), valor: a.to || '' },
        { rotulo: t('Idioma / template'), valor: a.lang ? `${a.lang.toUpperCase()} · ${a.template || 'job_inquiry'}` : 'PT · job_inquiry' },
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
