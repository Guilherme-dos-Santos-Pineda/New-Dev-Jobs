import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate } from '../utils.js';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const RUN_BADGE = { queued: 'warn', running: 'warn', done: 'ok', failed: 'danger' };

export default function AdminStats() {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try { setData(await api.adminAiStats()); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <div className="card center" style={{ padding: 40 }}><div className="spinner" /></div>;
    if (!data) return null;

    const { raw, jobs, ai, runs } = data;
    const precision = raw.total ? Math.round((raw.classified_jobs / raw.total) * 100) : 0;
    const cards = [
        { l: 'Posts coletados', v: nf(raw.total), i: 'ti-database' },
        { l: 'Classificados como vaga', v: nf(raw.classified_jobs), i: 'ti-briefcase' },
        { l: 'Aprovados', v: nf(raw.approved), i: 'ti-circle-check' },
        { l: 'Rejeitados', v: nf(raw.rejected), i: 'ti-circle-x' },
        { l: 'Pendentes', v: nf(raw.pending), i: 'ti-clock' },
        { l: 'Vagas (banco)', v: nf(jobs.total), i: 'ti-list-check' },
        { l: 'Score médio IA', v: `${jobs.avgscore}%`, i: 'ti-target' },
        { l: '% vaga / coletado', v: `${precision}%`, i: 'ti-percentage' },
    ];

    return (
        <>
            <div className="cards-grid" style={{ marginBottom: 18 }}>
                {cards.map((c) => (
                    <div key={c.l} className="card kpi">
                        <div className="kpi-top"><span className="kpi-ico"><i className={`ti ${c.i}`} /></span><span className="kpi-label">{c.l}</span></div>
                        <div className="kpi-num">{c.v}</div>
                    </div>
                ))}
            </div>

            <div className="row" style={{ alignItems: 'flex-start' }}>
                <div className="card" style={{ flex: 1, minWidth: 280 }}>
                    <div className="section-title"><i className="ti ti-cpu" /> Estado da IA (Groq)</div>
                    <div className="row" style={{ gap: 8, marginBottom: 8 }}>
                        <span className={`badge ${ai.enabled ? 'ok' : 'neutral'}`}>{ai.enabled ? 'ativa' : 'desligada'}</span>
                        <span className={`badge ${ai.open ? 'danger' : 'ok'}`}>circuito {ai.open ? 'aberto (fallback)' : 'fechado'}</span>
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>Modelo: <b>{ai.model}</b>{ai.failures ? ` · falhas recentes: ${ai.failures}` : ''}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>O circuit breaker abre após falhas seguidas e cai no fallback (regex), sem queimar créditos.</div>
                </div>

                <div className="card" style={{ flex: 1.2, minWidth: 300 }}>
                    <div className="row" style={{ alignItems: 'center' }}>
                        <div className="section-title" style={{ margin: 0 }}><i className="ti ti-history" /> Execuções do scraper</div>
                        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={load}><i className="ti ti-refresh" /></button>
                    </div>
                    {runs.length === 0 ? (
                        <div className="empty" style={{ padding: 20 }}><i className="ti ti-clock-off" />Sem execuções.</div>
                    ) : runs.map((r) => (
                        <div key={r.id} className="rank-row">
                            <span className={`badge ${RUN_BADGE[r.status] || 'neutral'}`}>{r.status}</span>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{r.type === 'discovery' ? 'Descoberta' : 'Monitoramento'}</div>
                                <div className="muted" style={{ fontSize: 11.5 }}>
                                    {fmtDate(r.createdAt)}{r.status === 'failed' && r.error ? ` · ${r.error.slice(0, 50)}` : (r.stats && Object.keys(r.stats).length ? ` · ${Object.entries(r.stats).map(([k, v]) => `${k}:${v}`).join(' ')}` : '')}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
