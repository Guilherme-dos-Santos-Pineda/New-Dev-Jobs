import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { scoreClass, fmtDate } from '../utils.js';

const STATUS = {
    sent: { badge: 'ok', icon: 'ti-circle-check', label: 'enviado' },
    failed: { badge: 'danger', icon: 'ti-alert-triangle', label: 'falhou' },
    skipped: { badge: 'neutral', icon: 'ti-player-skip-forward', label: 'pulado' },
};

export default function Applications() {
    // stale-while-revalidate: ao voltar para a aba, mostra na hora e revalida em silêncio.
    const { data, loading } = useCachedResource('applications', () => api.getApplications());
    const apps = data?.applications || [];
    const [open, setOpen] = useState(null);

    return (
        <div className="page">
            <div className="page-head">
                <h1>Candidaturas</h1>
                <p>Histórico de currículos enviados automaticamente.</p>
            </div>

            {loading ? (
                <div className="app-cards">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton sk-card" style={{ height: 150 }} />)}</div>
            ) : apps.length === 0 ? (
                <div className="card empty">
                    <i className="ti ti-send" />
                    Você ainda não se candidatou a nenhuma vaga.
                    <div style={{ marginTop: 14 }}><Link to="/app" className="btn primary sm"><i className="ti ti-radar-2" /> Procurar vagas</Link></div>
                </div>
            ) : (
                <div className="app-cards">
                    {apps.map((a, i) => {
                        const st = STATUS[a.status] || STATUS.sent;
                        const sentOk = (a.status || 'sent') === 'sent';
                        return (
                            <div key={a.id} className={`card app-card fade-in d${(i % 6) + 1}`}>
                                <div className="app-card-top">
                                    <div className="app-avatar"><i className="ti ti-building" /></div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="app-card-title">{a.title || 'Vaga'}</div>
                                        <div className="app-card-meta">{a.company || '—'} · {fmtDate(a.sentAt || a.createdAt)}</div>
                                    </div>
                                    <span className={`score ${scoreClass(a.matchScore)}`} style={{ flexShrink: 0 }}>{a.matchScore}%</span>
                                </div>

                                <div className="app-card-status">
                                    <i className={`ti ${st.icon} lead`} style={{ color: `var(--color-${st.badge === 'ok' ? 'success' : st.badge === 'danger' ? 'danger' : 'text-tertiary'})` }} />
                                    <span>currículo {st.label}</span>
                                    {sentOk && <span className="via"><i className="ti ti-brand-gmail" /> via seu Gmail</span>}
                                </div>

                                <div className="app-card-foot">
                                    <span className="muted" style={{ fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        <i className="ti ti-mail" /> {a.to || '—'}
                                    </span>
                                    <div className="spacer" />
                                    <button className="btn ghost sm" onClick={() => setOpen(a)}><i className="ti ti-eye" /> ver email</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Modal: prévia do email enviado */}
            {open && (
                <div className="modal-overlay" onClick={() => setOpen(null)}>
                    <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-head">
                            <h3>{open.title || 'Vaga'}</h3>
                            <button className="close" onClick={() => setOpen(null)}><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body" style={{ padding: 20 }}>
                            <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                                {open.company || '—'} · para <b>{open.to}</b> · {fmtDate(open.sentAt || open.createdAt)}
                            </div>
                            <div className="app-card-status" style={{ marginBottom: 14 }}>
                                <i className="ti ti-mail-cog lead" style={{ color: 'var(--color-accent)' }} />
                                <span style={{ fontWeight: 600 }}>{open.subject || '—'}</span>
                            </div>
                            {open.body ? (
                                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--color-text-secondary)' }}>{open.body}</div>
                            ) : (
                                <div className="muted" style={{ fontSize: 12.5 }}>Corpo do email não disponível para esta candidatura.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
