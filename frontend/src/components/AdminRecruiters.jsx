import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate } from '../utils.js';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const STATUS_BADGE = { discovered: 'warn', approved: 'ok', rejected: 'danger' };

export default function AdminRecruiters() {
    const toast = useToast();
    const [stats, setStats] = useState(null);
    const [data, setData] = useState({ recruiters: [], total: 0, page: 1, pageSize: 25 });
    const [loading, setLoading] = useState(true);
    const [f, setF] = useState({ q: '', status: '', hasJobs: '', hasEmail: '', sort: 'jobs' });
    const [page, setPage] = useState(1);

    async function load(p = page, filters = f) {
        setLoading(true);
        try {
            const [s, d] = await Promise.all([
                api.adminRecruiterStats(),
                api.adminRecruiters({ ...filters, hasEmail: filters.hasEmail || undefined, page: p, pageSize: 25 }),
            ]);
            setStats(s); setData(d); setPage(d.page);
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    const apply = () => load(1);

    async function setStatus(r, status) {
        try { await api.adminUpdateRecruiter(r.id, status); setData((d) => ({ ...d, recruiters: d.recruiters.map((x) => (x.id === r.id ? { ...x, status } : x)) })); }
        catch (e) { toast.show(e.message, 'error'); }
    }

    const totalPages = Math.max(1, Math.ceil((data.total || 0) / (data.pageSize || 25)));
    const statCards = stats ? [
        { l: 'Total', v: nf(stats.total), i: 'ti-address-book' },
        { l: 'Com vagas', v: nf(stats.withJobs), i: 'ti-briefcase' },
        { l: 'Sem vagas (órfãos)', v: nf(stats.withoutJobs), i: 'ti-user-question' },
        { l: 'Com email válido', v: nf(stats.withEmail), i: 'ti-mail-check' },
    ] : [];

    return (
        <>
            <div className="cards-grid" style={{ marginBottom: 16 }}>
                {statCards.map((c) => (
                    <div key={c.l} className="card kpi">
                        <div className="kpi-top"><span className="kpi-ico"><i className={`ti ${c.i}`} /></span><span className="kpi-label">{c.l}</span></div>
                        <div className="kpi-num">{c.v}</div>
                    </div>
                ))}
            </div>

            <div className="card">
                <div className="toolbar">
                    <div className="search"><i className="ti ti-search" />
                        <input className="input" placeholder="Nome, empresa ou email…" value={f.q}
                            onChange={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
                    </div>
                    <select className="select" style={{ maxWidth: 150 }} value={f.status} onChange={(e) => set('status', e.target.value)}>
                        <option value="">Status</option><option value="discovered">Descoberto</option>
                        <option value="approved">Aprovado</option><option value="rejected">Rejeitado</option>
                    </select>
                    <select className="select" style={{ maxWidth: 150 }} value={f.hasJobs} onChange={(e) => set('hasJobs', e.target.value)}>
                        <option value="">Com/sem vaga</option><option value="true">Com vagas</option><option value="false">Sem vagas (órfão)</option>
                    </select>
                    <select className="select" style={{ maxWidth: 150 }} value={f.sort} onChange={(e) => set('sort', e.target.value)}>
                        <option value="jobs">+ vagas</option><option value="emails">+ emails enviados</option>
                        <option value="recent">+ recentes</option><option value="name">nome</option>
                    </select>
                    <label className="row" style={{ alignItems: 'center', gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={f.hasEmail === 'true'} onChange={(e) => set('hasEmail', e.target.checked ? 'true' : '')} /> só com email
                    </label>
                    <button className="btn primary sm" onClick={apply}><i className="ti ti-filter" /> Filtrar</button>
                </div>

                {loading ? (
                    <div><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>
                ) : data.recruiters.length === 0 ? (
                    <div className="empty" style={{ padding: 30 }}><i className="ti ti-user-off" />Nenhum recrutador.</div>
                ) : (
                    <div className="dtable-wrap">
                        <table className="dtable">
                            <thead><tr><th>Nome</th><th>Empresa</th><th>Email</th><th>Vagas</th><th>Emails enviados</th><th>Status</th><th className="col-actions">Ações</th></tr></thead>
                            <tbody>
                                {data.recruiters.map((r) => (
                                    <tr key={r.id}>
                                        <td style={{ fontWeight: 600 }}>
                                            {r.linkedinUrl ? <a href={r.linkedinUrl} target="_blank" rel="noopener" style={{ textDecoration: 'underline' }}>{r.name || 'Recrutador'}</a> : (r.name || 'Recrutador')}
                                            <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>{r.title || ''}</div>
                                        </td>
                                        <td>{r.company || '—'}</td>
                                        <td>{r.email || <span className="muted">sem email</span>}</td>
                                        <td>{r.jobsCount > 0 ? <span className="badge ok">{r.jobsCount}</span> : <span className="badge neutral">órfão</span>}</td>
                                        <td className="mono">{nf(r.emailsSent)}</td>
                                        <td><span className={`badge ${STATUS_BADGE[r.status] || 'neutral'}`}>{r.status}</span></td>
                                        <td className="col-actions">
                                            {r.status !== 'approved' && <button className="btn ghost sm" title="Aprovar" onClick={() => setStatus(r, 'approved')}><i className="ti ti-check" /></button>}
                                            {r.status !== 'rejected' && <button className="btn ghost sm" title="Rejeitar" onClick={() => setStatus(r, 'rejected')}><i className="ti ti-x" /></button>}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="row" style={{ alignItems: 'center', marginTop: 12 }}>
                    <span className="muted" style={{ fontSize: 12 }}>{nf(data.total)} recrutador(es) · página {data.page}/{totalPages}</span>
                    <div className="spacer" />
                    <button className="btn ghost sm" disabled={data.page <= 1} onClick={() => load(data.page - 1)}><i className="ti ti-chevron-left" /> anterior</button>
                    <button className="btn ghost sm" disabled={data.page >= totalPages} onClick={() => load(data.page + 1)}>próxima <i className="ti ti-chevron-right" /></button>
                </div>
            </div>
        </>
    );
}
