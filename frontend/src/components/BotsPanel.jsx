import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { fmtDate } from '../utils.js';

const STATUS_BADGE = { discovered: 'warn', approved: 'ok', rejected: 'danger' };
const RUN_BADGE = { queued: 'warn', running: 'warn', done: 'ok', failed: 'danger' };

const parseQueries = (text) => text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

export default function BotsPanel() {
    const toast = useToast();
    const [recruiters, setRecruiters] = useState([]);
    const [runs, setRuns] = useState([]);
    const [loading, setLoading] = useState(true);
    const [running, setRunning] = useState('');

    // formulários dos runs
    const [discQueries, setDiscQueries] = useState('Tech Recruiter\nTalent Acquisition');
    const [discMax, setDiscMax] = useState(5);
    const [monQueries, setMonQueries] = useState('"hiring backend developer"\n"hiring full stack developer"');
    const [monMax, setMonMax] = useState(10);

    const load = useCallback(async () => {
        try {
            const [{ recruiters }, { runs }] = await Promise.all([api.adminRecruiters(), api.adminScraperRuns()]);
            setRecruiters(recruiters);
            setRuns(runs);
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    async function setStatus(r, status) {
        try {
            await api.adminUpdateRecruiter(r.id, status);
            setRecruiters((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
        } catch (e) { toast.show(e.message, 'error'); }
    }

    async function runScraper(type) {
        const params = type === 'discovery'
            ? { queries: parseQueries(discQueries), maxResults: Number(discMax) || 5 }
            : { queries: parseQueries(monQueries), maxPosts: Number(monMax) || 10 };
        const cost = type === 'discovery' ? '~$0.03/perfil (com email)' : '~$0.01 a cada 5 posts';
        if (!window.confirm(`Rodar ${type === 'discovery' ? 'descoberta' : 'monitoramento'}?\n\nIsso consome créditos do Apify (${cost}).`)) return;
        setRunning(type);
        try {
            await api.adminRunScraper(type, params);
            toast.show('Run enfileirado. Acompanhe no histórico abaixo.');
            setTimeout(load, 2500); // dá tempo do worker pegar
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setRunning(''); }
    }

    if (loading) return <div className="card center" style={{ padding: 40 }}><div className="spinner" /></div>;

    const fmtStats = (s) => (s && Object.keys(s).length ? Object.entries(s).map(([k, v]) => `${k}: ${v}`).join(' · ') : '—');

    return (
        <>
            {/* ---- Disparar runs ---- */}
            <div className="row" style={{ alignItems: 'stretch', gap: 14 }}>
                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="section-title"><i className="ti ti-user-search" /> Descoberta de recrutadores</div>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 10 }}>
                        Busca perfis (Profile Search) e popula a base. Gasta créditos do Apify.
                    </p>
                    <div className="field">
                        <label>Queries (uma por linha)</label>
                        <textarea className="input" rows={3} value={discQueries} onChange={(e) => setDiscQueries(e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Máx. resultados</label>
                        <input className="input" type="number" min="1" max="50" value={discMax} onChange={(e) => setDiscMax(e.target.value)} />
                    </div>
                    <button className="btn primary block sm" disabled={!!running} onClick={() => runScraper('discovery')}>
                        {running === 'discovery' ? 'Enfileirando…' : (<><i className="ti ti-player-play" /> Rodar descoberta</>)}
                    </button>
                </div>

                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="section-title"><i className="ti ti-radar" /> Monitoramento de vagas</div>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 10 }}>
                        Busca posts dos recrutadores <b>aprovados</b> (queries entre aspas = mais preciso).
                    </p>
                    <div className="field">
                        <label>Queries (uma por linha, use aspas)</label>
                        <textarea className="input" rows={3} value={monQueries} onChange={(e) => setMonQueries(e.target.value)} />
                    </div>
                    <div className="field">
                        <label>Máx. posts</label>
                        <input className="input" type="number" min="1" max="50" value={monMax} onChange={(e) => setMonMax(e.target.value)} />
                    </div>
                    <button className="btn primary block sm" disabled={!!running} onClick={() => runScraper('monitoring')}>
                        {running === 'monitoring' ? 'Enfileirando…' : (<><i className="ti ti-player-play" /> Rodar monitoramento</>)}
                    </button>
                </div>
            </div>

            <div className="row" style={{ alignItems: 'flex-start', gap: 14, marginTop: 14 }}>
                {/* ---- Base de recrutadores ---- */}
                <div className="card" style={{ flex: 1.3, minWidth: 340 }}>
                    <div className="row" style={{ alignItems: 'center' }}>
                        <div className="section-title" style={{ margin: 0 }}><i className="ti ti-address-book" /> Recrutadores ({recruiters.length})</div>
                        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={load}><i className="ti ti-refresh" /></button>
                    </div>
                    {recruiters.length === 0 ? (
                        <div className="empty" style={{ padding: 22 }}><i className="ti ti-user-off" />Nenhum recrutador ainda. Rode a descoberta.</div>
                    ) : recruiters.map((r) => (
                        <div key={r.id} className="rank-row">
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{r.name || 'Recrutador'}</div>
                                <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {r.email || 'sem email'}{r.title ? ` · ${r.title}` : ''}
                                </div>
                            </div>
                            <span className={`badge ${STATUS_BADGE[r.status] || 'warn'}`}>{r.status}</span>
                            {r.status !== 'approved' && <button className="btn ghost sm" title="Aprovar" onClick={() => setStatus(r, 'approved')}><i className="ti ti-check" /></button>}
                            {r.status !== 'rejected' && <button className="btn ghost sm" title="Rejeitar" onClick={() => setStatus(r, 'rejected')}><i className="ti ti-x" /></button>}
                        </div>
                    ))}
                </div>

                {/* ---- Histórico de execuções ---- */}
                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="section-title"><i className="ti ti-history" /> Execuções recentes</div>
                    {runs.length === 0 ? (
                        <div className="empty" style={{ padding: 22 }}><i className="ti ti-clock-off" />Nenhuma execução ainda.</div>
                    ) : runs.map((run) => (
                        <div key={run.id} className="rank-row" style={{ alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{run.type === 'discovery' ? 'Descoberta' : 'Monitoramento'}</div>
                                <div className="muted" style={{ fontSize: 11.5 }}>{fmtDate(run.createdAt)}</div>
                                <div className="muted" style={{ fontSize: 11.5 }}>{run.status === 'failed' ? (run.error || 'erro') : fmtStats(run.stats)}</div>
                            </div>
                            <span className={`badge ${RUN_BADGE[run.status] || 'warn'}`}>{run.status}</span>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}
