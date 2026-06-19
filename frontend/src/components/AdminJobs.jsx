import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate, scoreClass } from '../utils.js';

const SENIORITIES = ['', 'estagio', 'junior', 'pleno', 'senior', 'lead'];

const PAGE_SIZE = 30;

export default function AdminJobs() {
    const toast = useToast();
    const [data, setData] = useState({ jobs: [], total: 0, page: 1 });
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(null);
    const [f, setF] = useState({ q: '', seniority: '', minScore: '', tech: '' });

    async function load(filters = f, page = 1) {
        setLoading(true);
        try { setData(await api.adminJobs({ ...filters, page, pageSize: PAGE_SIZE })); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(f, 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
    const jobs = data.jobs || [];
    const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));

    return (
        <div className="card">
            <div className="toolbar">
                <div className="search"><i className="ti ti-search" />
                    <input className="input" placeholder="Cargo ou empresa…" value={f.q}
                        onChange={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(f, 1)} />
                </div>
                <input className="input" style={{ maxWidth: 150 }} placeholder="Tecnologia" value={f.tech}
                    onChange={(e) => set('tech', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(f, 1)} />
                <select className="select" style={{ maxWidth: 150 }} value={f.seniority} onChange={(e) => set('seniority', e.target.value)}>
                    {SENIORITIES.map((s) => <option key={s} value={s}>{s || 'Senioridade'}</option>)}
                </select>
                <select className="select" style={{ maxWidth: 140 }} value={f.minScore} onChange={(e) => set('minScore', e.target.value)}>
                    <option value="">Score mín.</option>
                    {[50, 70, 80, 90].map((s) => <option key={s} value={s}>≥ {s}%</option>)}
                </select>
                <button className="btn primary sm" onClick={() => load(f, 1)}><i className="ti ti-filter" /> Filtrar</button>
            </div>

            {loading ? (
                <div><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>
            ) : jobs.length === 0 ? (
                <div className="empty" style={{ padding: 30 }}><i className="ti ti-briefcase-off" />Nenhuma vaga encontrada.</div>
            ) : (
                <div className="dtable-wrap">
                    <table className="dtable">
                        <thead><tr><th>Cargo</th><th>Empresa</th><th>Skills</th><th>Score IA</th><th>Senioridade</th><th>Local</th><th>Data</th></tr></thead>
                        <tbody>
                            {jobs.map((j) => (
                                <tr key={j.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(j)}>
                                    <td style={{ fontWeight: 600, maxWidth: 240 }}>{j.title || '—'}</td>
                                    <td>{j.company || '—'}</td>
                                    <td style={{ maxWidth: 180 }}>{(j.skills || []).slice(0, 3).join(', ') || '—'}</td>
                                    <td>{j.aiScore != null ? <span className={`score ${scoreClass(j.aiScore)}`}>{j.aiScore}%</span> : <span className="muted">—</span>}</td>
                                    <td>{j.seniority || '—'}</td>
                                    <td style={{ maxWidth: 140 }}>{j.location || '—'}</td>
                                    <td className="muted" style={{ whiteSpace: 'nowrap' }}>{fmtDate(j.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            <div className="row" style={{ alignItems: 'center', marginTop: 10 }}>
                <span className="muted" style={{ fontSize: 12 }}>{(data.total || 0).toLocaleString('pt-BR')} vaga(s) · página {data.page || 1}/{totalPages}</span>
                <div className="spacer" />
                <button className="btn ghost sm" disabled={loading || (data.page || 1) <= 1} onClick={() => load(f, (data.page || 1) - 1)}><i className="ti ti-chevron-left" /> anterior</button>
                <button className="btn ghost sm" disabled={loading || (data.page || 1) >= totalPages} onClick={() => load(f, (data.page || 1) + 1)}>próxima <i className="ti ti-chevron-right" /></button>
            </div>

            {/* Detalhe da vaga (inclui o conteúdo bruto do post) */}
            {open && (
                <div className="modal-overlay" onClick={() => setOpen(null)}>
                    <div className="modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-head">
                            <h3>{open.title || 'Vaga'}</h3>
                            <button className="close" onClick={() => setOpen(null)}><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body" style={{ padding: 20 }}>
                            <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                                {open.aiScore != null && <span className={`score ${scoreClass(open.aiScore)}`}>{open.aiScore}% IA</span>}
                                {open.classification && <span className="badge neutral">{open.classification}</span>}
                                {open.seniority && <span className="badge info">{open.seniority}</span>}
                                {open.modality && <span className="badge info">{open.modality}</span>}
                            </div>
                            <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
                                <div><b>Empresa:</b> {open.company || '—'}</div>
                                <div><b>Email:</b> {open.email || '—'}</div>
                                {open.location && <div><b>Local:</b> {open.location}</div>}
                                {open.salary && <div><b>Salário:</b> {open.salary}</div>}
                                <div><b>Skills:</b> {(open.skills || []).join(', ') || '—'}</div>
                                <div className="muted"><b>Coletada:</b> {fmtDate(open.createdAt)}</div>
                            </div>
                            <div className="section-title" style={{ fontSize: 13 }}>Conteúdo do post (bruto)</div>
                            <div style={{ fontSize: 12.5, whiteSpace: 'pre-wrap', lineHeight: 1.6, color: 'var(--color-text-secondary)', background: 'var(--color-bg-secondary)', padding: 12, borderRadius: 10, maxHeight: 320, overflow: 'auto' }}>
                                {open.description || '(sem conteúdo)'}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
