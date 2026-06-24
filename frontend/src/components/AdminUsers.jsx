import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate, scoreClass } from '../utils.js';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const PLAN_BADGE = { free: 'neutral', starter: 'info', pro: 'ok' };
const APP_BADGE = { sent: 'ok', failed: 'danger', skipped: 'neutral' };
const PAGE = 25;
const fmtFull = (d) => (d ? new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function AdminUsers() {
    const toast = useToast();
    const [data, setData] = useState({ users: [], total: 0, page: 1 });
    const [loading, setLoading] = useState(true);
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(null);     // usuário selecionado (linha)
    const [detail, setDetail] = useState(null); // detalhe carregado
    const [deleting, setDeleting] = useState(false);

    async function load(query = q, page = 1) {
        setLoading(true);
        try { setData(await api.adminUsers({ q: query || undefined, page, pageSize: PAGE })); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load('', 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function openDetail(u) {
        setOpen(u); setDetail(null);
        try { setDetail(await api.adminUser(u.id)); }
        catch (e) { toast.show(e.message, 'error'); }
    }
    async function del(u) {
        if (!window.confirm(`Apagar ${u.email}?\n\nRemove a conta, perfil e candidaturas — irreversível.`)) return;
        setDeleting(true);
        try { await api.adminDeleteUser(u.id); toast.show('Usuário apagado'); setOpen(null); load(q, data.page); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setDeleting(false); }
    }

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE));
    const users = data.users || [];

    return (
        <div className="card">
            <div className="toolbar">
                <div className="search"><i className="ti ti-search" />
                    <input className="input" placeholder="Nome ou email…" value={q}
                        onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(q, 1)} />
                </div>
                <button className="btn primary sm" onClick={() => load(q, 1)}><i className="ti ti-search" /> Buscar</button>
                <div className="spacer" />
                <span className="muted" style={{ fontSize: 12 }}>{nf(data.total)} usuário(s)</span>
            </div>

            {loading ? (
                <div><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>
            ) : users.length === 0 ? (
                <div className="empty" style={{ padding: 30 }}><i className="ti ti-user-off" />Nenhum usuário.</div>
            ) : (
                <div className="dtable-wrap">
                    <table className="dtable">
                        <thead><tr><th>Usuário</th><th>Plano</th><th>Gmail</th><th>Áreas</th><th>Candidaturas</th><th>Criado</th><th className="col-actions">Ações</th></tr></thead>
                        <tbody>
                            {users.map((u) => (
                                <tr key={u.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(u)}>
                                    <td style={{ fontWeight: 600 }}>{u.name || '—'}
                                        <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{u.email}{u.role === 'admin' ? ' · admin' : ''}</div>
                                    </td>
                                    <td><span className={`badge ${PLAN_BADGE[u.plan] || 'neutral'}`}>{u.plan}</span></td>
                                    <td>{u.googleConnected ? <span className="badge ok" style={{ fontSize: 10 }}>conectado</span> : <span className="muted" style={{ fontSize: 12 }}>—</span>}</td>
                                    <td style={{ fontSize: 12 }}>{(u.areas || []).join(', ') || '—'}</td>
                                    <td className="mono">{nf(u.apps)}</td>
                                    <td className="muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
                                    <td className="col-actions">
                                        <button className="btn ghost sm" title="Detalhes" onClick={(e) => { e.stopPropagation(); openDetail(u); }}><i className="ti ti-eye" /></button>
                                        <button className="btn ghost sm" title="Apagar" onClick={(e) => { e.stopPropagation(); del(u); }}><i className="ti ti-trash" /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="row" style={{ alignItems: 'center', marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>página {data.page || 1}/{totalPages}</span>
                <div className="spacer" />
                <button className="btn ghost sm" disabled={loading || (data.page || 1) <= 1} onClick={() => load(q, (data.page || 1) - 1)}><i className="ti ti-chevron-left" /> anterior</button>
                <button className="btn ghost sm" disabled={loading || (data.page || 1) >= totalPages} onClick={() => load(q, (data.page || 1) + 1)}>próxima <i className="ti ti-chevron-right" /></button>
            </div>

            {/* Detalhe do usuário */}
            {open && (
                <div className="modal-overlay" onClick={() => !deleting && setOpen(null)}>
                    <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-head">
                            <h3>{open.name || open.email}</h3>
                            <button className="close" onClick={() => setOpen(null)}><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body" style={{ padding: 20 }}>
                            {!detail ? (
                                <div className="center" style={{ padding: 30 }}><div className="spinner" /></div>
                            ) : (
                                <>
                                    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
                                        <span className={`badge ${PLAN_BADGE[detail.user.plan] || 'neutral'}`}>plano {detail.user.plan}</span>
                                        {detail.user.googleConnected && <span className="badge ok">{detail.user.googleEmail || 'Gmail conectado'}</span>}
                                        {detail.user.role === 'admin' && <span className="badge info">admin</span>}
                                    </div>
                                    <div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 14 }}>
                                        <div><b>Email:</b> {detail.user.email}</div>
                                        <div><b>Conta criada:</b> {fmtFull(detail.auth?.createdAt || detail.user.createdAt)}</div>
                                        <div><b>Último login:</b> {fmtFull(detail.auth?.lastSignIn)}{detail.auth?.provider ? ` · via ${detail.auth.provider}` : ''}</div>
                                        <div><b>Candidaturas:</b> {nf(detail.counts.total)} ({nf(detail.counts.sent)} enviadas, {nf(detail.counts.failed)} falharam)</div>
                                    </div>

                                    <div className="section-title" style={{ fontSize: 13 }}>Perfil</div>
                                    {detail.profile ? (
                                        <div style={{ fontSize: 12.5, lineHeight: 1.8, marginBottom: 14 }}>
                                            <div><b>Áreas:</b> {(detail.profile.areas || []).join(', ') || '—'} · <b>Senioridade:</b> {(detail.profile.seniorities || []).join(', ') || '—'}</div>
                                            <div><b>Skills:</b> {(detail.profile.skills || []).join(', ') || '—'}</div>
                                            <div><b>Headline:</b> {detail.profile.headline || '—'} · <b>Região:</b> {detail.profile.region || '—'}</div>
                                            <div><b>CV:</b> {detail.profile.hasCv ? (detail.profile.cvName || 'enviado') : 'não enviado'}{detail.profile.linkedin ? ` · LinkedIn: ${detail.profile.linkedin}` : ''}</div>
                                        </div>
                                    ) : <div className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Perfil não preenchido.</div>}

                                    <div className="section-title" style={{ fontSize: 13 }}>Candidaturas recentes</div>
                                    {detail.applications.length === 0 ? (
                                        <div className="muted" style={{ fontSize: 12.5 }}>Nenhuma candidatura.</div>
                                    ) : (
                                        <div style={{ maxHeight: 220, overflow: 'auto' }}>
                                            {detail.applications.map((a) => (
                                                <div key={a.id} className="rank-row">
                                                    <div style={{ minWidth: 0, flex: 1 }}>
                                                        <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.title || 'Vaga'}</div>
                                                        <div className="muted" style={{ fontSize: 11.5 }}>{a.company || '—'} · {fmtDate(a.createdAt)}</div>
                                                    </div>
                                                    <span className={`badge ${APP_BADGE[a.status] || 'neutral'}`} style={{ fontSize: 10 }}>{a.status}</span>
                                                    {a.matchScore != null && <span className={`score ${scoreClass(a.matchScore)}`}>{a.matchScore}%</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                        <div className="modal-foot">
                            <button className="btn ghost" onClick={() => setOpen(null)}>Fechar</button>
                            <button className="btn" style={{ color: 'var(--color-danger)' }} disabled={deleting} onClick={() => del(open)}>
                                <i className="ti ti-trash" /> {deleting ? 'Apagando…' : 'Apagar usuário'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
