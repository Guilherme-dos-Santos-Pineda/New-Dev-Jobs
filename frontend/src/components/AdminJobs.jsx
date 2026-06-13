import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate, scoreClass } from '../utils.js';

const SENIORITIES = ['', 'estagio', 'junior', 'pleno', 'senior', 'lead'];

export default function AdminJobs() {
    const toast = useToast();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [f, setF] = useState({ q: '', seniority: '', minScore: '', tech: '' });

    async function load(filters = f) {
        setLoading(true);
        try { const { jobs } = await api.adminJobs(filters); setJobs(jobs); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

    return (
        <div className="card">
            <div className="toolbar">
                <div className="search"><i className="ti ti-search" />
                    <input className="input" placeholder="Cargo ou empresa…" value={f.q}
                        onChange={(e) => set('q', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
                </div>
                <input className="input" style={{ maxWidth: 150 }} placeholder="Tecnologia" value={f.tech}
                    onChange={(e) => set('tech', e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} />
                <select className="select" style={{ maxWidth: 150 }} value={f.seniority} onChange={(e) => set('seniority', e.target.value)}>
                    {SENIORITIES.map((s) => <option key={s} value={s}>{s || 'Senioridade'}</option>)}
                </select>
                <select className="select" style={{ maxWidth: 140 }} value={f.minScore} onChange={(e) => set('minScore', e.target.value)}>
                    <option value="">Score mín.</option>
                    {[50, 70, 80, 90].map((s) => <option key={s} value={s}>≥ {s}%</option>)}
                </select>
                <button className="btn primary sm" onClick={() => load()}><i className="ti ti-filter" /> Filtrar</button>
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
                                <tr key={j.id}>
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
            <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>{jobs.length} vaga(s) · até 200 mais recentes.</div>
        </div>
    );
}
