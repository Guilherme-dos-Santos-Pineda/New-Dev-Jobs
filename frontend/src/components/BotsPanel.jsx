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
    const [discLocations, setDiscLocations] = useState('Brazil');
    const [discPages, setDiscPages] = useState(1);
    const [monQueries, setMonQueries] = useState('"hiring backend developer"\n"hiring full stack developer"');
    const [monMax, setMonMax] = useState(10);
    const [monPeriod, setMonPeriod] = useState('month');
    const [monPages, setMonPages] = useState(1);
    const [monOnlyJobs, setMonOnlyJobs] = useState(true);
    const [monRegion, setMonRegion] = useState('br');   // br | global
    const [monExclude, setMonExclude] = useState('india'); // países a excluir (quando global)
    const [monSource, setMonSource] = useState('saved'); // global | saved | selected
    const [monSelected, setMonSelected] = useState([]);  // ids quando 'selected'
    const [monMaxRecruiters, setMonMaxRecruiters] = useState(10); // cap da rotação (modo 'saved')
    // Seletor de recrutadores (modo 'selected'): busca + só monitoráveis (com LinkedIn)
    const [pickerQ, setPickerQ] = useState('');
    const [pickerList, setPickerList] = useState([]);
    const [pickerLoading, setPickerLoading] = useState(false);
    const [runsAll, setRunsAll] = useState(false);       // execuções: mostrar todas
    const [runDetail, setRunDetail] = useState(null);    // run aberto no modal

    const load = useCallback(async () => {
        try {
            const [{ recruiters }, { runs }] = await Promise.all([api.adminRecruiters(), api.adminScraperRuns()]);
            setRecruiters(recruiters);
            setRuns(runs);
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    // Carrega recrutadores monitoráveis (com LinkedIn) para o seletor do modo 'selected'.
    const loadPicker = useCallback(async (q) => {
        setPickerLoading(true);
        try {
            const { recruiters } = await api.adminRecruiters({ q: q || undefined, monitorable: 'true', pageSize: 100, sort: 'recent' });
            setPickerList(recruiters);
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setPickerLoading(false); }
    }, [toast]);

    useEffect(() => { if (monSource === 'selected') loadPicker(''); }, [monSource, loadPicker]);

    async function setStatus(r, status) {
        try {
            await api.adminUpdateRecruiter(r.id, status);
            setRecruiters((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
        } catch (e) { toast.show(e.message, 'error'); }
    }

    async function runScraper(type) {
        const params = type === 'discovery'
            ? {
                queries: parseQueries(discQueries), maxResults: Number(discMax) || 5,
                locations: parseQueries(discLocations), takePages: Number(discPages) || 1,
            }
            : {
                queries: parseQueries(monQueries), maxPosts: Number(monMax) || 10,
                source: monSource, ...(monSource === 'selected' ? { recruiterIds: monSelected } : {}),
                ...(monSource === 'saved' ? { maxRecruiters: Number(monMaxRecruiters) || 40 } : {}),
                contentType: monOnlyJobs ? 'jobs' : 'all', postedLimit: monPeriod, scrapePages: Number(monPages) || 1,
                region: monRegion, ...(monRegion === 'global' && monExclude.trim() ? { excludeCountries: parseQueries(monExclude) } : {}),
            };
        if (type === 'monitoring' && monSource === 'selected' && !monSelected.length) {
            toast.show('Selecione ao menos um recrutador.', 'error'); return;
        }
        const cost = type === 'discovery' ? '~$0.03/perfil (com email)' : '~$0.01 a cada 5 posts';
        if (!window.confirm(`Rodar ${type === 'discovery' ? 'descoberta' : 'monitoramento'}?\n\nIsso consome créditos do Apify (${cost}).`)) return;
        setRunning(type);
        let started;
        try {
            const r = await api.adminRunScraper(type, params);
            started = r.run;
            toast.show('Run iniciado — atualizando ao concluir…');
            await load(); // mostra o run "running" na hora
        } catch (e) { toast.show(e.message, 'error'); setRunning(''); return; }

        // Hot-reload: acompanha o run até terminar e recarrega sozinho (sem F5)
        let tries = 0;
        const iv = setInterval(async () => {
            tries += 1;
            try {
                const { runs } = await api.adminScraperRuns();
                const cur = runs.find((x) => x.id === started.id);
                if (cur && (cur.status === 'done' || cur.status === 'failed')) {
                    clearInterval(iv);
                    setRunning('');
                    await load();
                    toast.show(cur.status === 'done' ? `Concluído · ${fmtStats(cur.stats)}` : `Falhou: ${cur.error || 'erro'}`, cur.status === 'done' ? 'success' : 'error');
                }
            } catch { /* ignore */ }
            if (tries > 100) { clearInterval(iv); setRunning(''); } // ~5min de teto
        }, 3000);
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
                        <label>Países / locais (um por linha)</label>
                        <textarea className="input" rows={2} value={discLocations} onChange={(e) => setDiscLocations(e.target.value)} placeholder="Brazil&#10;Portugal" />
                    </div>
                    <div className="grid-2">
                        <div className="field">
                            <label>Máx. resultados</label>
                            <input className="input" type="number" min="1" max="100" value={discMax} onChange={(e) => setDiscMax(e.target.value)} />
                        </div>
                        <div className="field">
                            <label>Páginas (25/pág)</label>
                            <input className="input" type="number" min="1" max="40" value={discPages} onChange={(e) => setDiscPages(e.target.value)} />
                        </div>
                    </div>
                    <button className="btn primary block sm" disabled={!!running} onClick={() => runScraper('discovery')}>
                        {running === 'discovery' ? 'Enfileirando…' : (<><i className="ti ti-player-play" /> Rodar descoberta</>)}
                    </button>
                </div>

                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="section-title"><i className="ti ti-radar" /> Monitoramento de vagas</div>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: -4, marginBottom: 10 }}>
                        Busca posts (queries entre aspas = mais preciso).
                    </p>
                    <div className="field">
                        <label>Onde buscar</label>
                        <select className="select" value={monSource} onChange={(e) => setMonSource(e.target.value)}>
                            <option value="saved">Todos os recrutadores salvos (aprovados)</option>
                            <option value="selected">Recrutadores selecionados</option>
                            <option value="global">LinkedIn inteiro (mais volume/custo)</option>
                        </select>
                    </div>
                    {monSource === 'saved' && (
                        <div className="field">
                            <label>Quantos recrutadores por run (mais obsoletos primeiro)</label>
                            <input className="input" type="number" min="1" max="500" value={monMaxRecruiters}
                                onChange={(e) => setMonMaxRecruiters(e.target.value)} />
                            <div className="hint">Rotaciona pela base aprovada (os mais obsoletos primeiro). Apify processa em lotes de 10 — cada 10 = 1 chamada (mais custo).</div>
                        </div>
                    )}
                    {monSource === 'selected' && (
                        <div className="field">
                            <label>Selecione os recrutadores <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>(só monitoráveis · {monSelected.length} selecionado(s))</span></label>
                            <div className="search" style={{ marginBottom: 8 }}>
                                <i className="ti ti-search" />
                                <input className="input" placeholder="Buscar por nome, empresa ou email…" value={pickerQ}
                                    onChange={(e) => setPickerQ(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadPicker(pickerQ); } }} />
                            </div>
                            <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--color-border-light)', borderRadius: 10, padding: 8 }}>
                                {pickerLoading ? <div className="muted" style={{ fontSize: 12 }}>Carregando…</div>
                                    : pickerList.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>Nenhum recrutador monitorável (com LinkedIn). Rode a descoberta para achar perfis.</div>
                                        : pickerList.map((r) => (
                                            <label key={r.id} className="row" style={{ alignItems: 'center', gap: 8, fontSize: 12.5, padding: '3px 0', fontWeight: 400 }}>
                                                <input type="checkbox" checked={monSelected.includes(r.id)}
                                                    onChange={(e) => setMonSelected((prev) => e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id))} />
                                                {r.name || 'Recrutador'} <span className="muted">{r.company || ''}</span>
                                            </label>
                                        ))}
                            </div>
                            <div className="hint">Apify monitora no máximo 10 por execução — acima disso rodamos em lotes (mais custo).</div>
                        </div>
                    )}
                    <div className="field">
                        <label>Região</label>
                        <select className="select" value={monRegion} onChange={(e) => setMonRegion(e.target.value)}>
                            <option value="br">Só Brasil (heurística: .br, cidades BR, português)</option>
                            <option value="global">Internacional (todos os países)</option>
                        </select>
                    </div>
                    {monRegion === 'global' && (
                        <div className="field">
                            <label>Excluir países (um por linha)</label>
                            <textarea className="input" rows={2} value={monExclude} onChange={(e) => setMonExclude(e.target.value)} placeholder="india&#10;usa" />
                        </div>
                    )}
                    <div className="field">
                        <label>Queries (uma por linha, use aspas)</label>
                        <textarea className="input" rows={3} value={monQueries} onChange={(e) => setMonQueries(e.target.value)} />
                    </div>
                    <div className="grid-2">
                        <div className="field">
                            <label>Máx. posts / query</label>
                            <input className="input" type="number" min="1" max="100" value={monMax} onChange={(e) => setMonMax(e.target.value)} />
                        </div>
                        <div className="field">
                            <label>Páginas</label>
                            <input className="input" type="number" min="1" max="40" value={monPages} onChange={(e) => setMonPages(e.target.value)} />
                        </div>
                    </div>
                    <div className="field">
                        <label>Período (recência)</label>
                        <select className="select" value={monPeriod} onChange={(e) => setMonPeriod(e.target.value)}>
                            <option value="any">Qualquer</option><option value="24h">24h</option>
                            <option value="week">Última semana</option><option value="month">Último mês</option>
                            <option value="3months">3 meses</option><option value="year">Último ano</option>
                        </select>
                    </div>
                    <label className="row" style={{ alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 12, fontWeight: 400 }}>
                        <input type="checkbox" checked={monOnlyJobs} onChange={(e) => setMonOnlyJobs(e.target.checked)} /> só posts de vaga (recomendado)
                    </label>
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

                {/* ---- Histórico de execuções (5 + ver mais; clique abre detalhes) ---- */}
                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="section-title"><i className="ti ti-history" /> Execuções recentes</div>
                    {runs.length === 0 ? (
                        <div className="empty" style={{ padding: 22 }}><i className="ti ti-clock-off" />Nenhuma execução ainda.</div>
                    ) : runs.slice(0, runsAll ? runs.length : 5).map((run) => (
                        <div key={run.id} className="rank-row" style={{ alignItems: 'flex-start', cursor: 'pointer' }} onClick={() => setRunDetail(run)}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{run.type === 'discovery' ? 'Descoberta' : 'Monitoramento'}</div>
                                <div className="muted" style={{ fontSize: 11.5 }}>{fmtDate(run.createdAt)}</div>
                                <div className="muted" style={{ fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{run.status === 'failed' ? (run.error || 'erro') : fmtStats(run.stats)}</div>
                            </div>
                            <span className={`badge ${RUN_BADGE[run.status] || 'warn'}`}>{run.status}</span>
                        </div>
                    ))}
                    {runs.length > 5 && (
                        <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setRunsAll((v) => !v)}>
                            {runsAll ? 'ver menos' : `ver mais (${runs.length - 5})`}
                        </button>
                    )}
                </div>
            </div>

            {/* Modal de detalhes da execução */}
            {runDetail && (
                <div className="modal-overlay" onClick={() => setRunDetail(null)}>
                    <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-head">
                            <h3>{runDetail.type === 'discovery' ? 'Descoberta' : 'Monitoramento'} · {runDetail.status}</h3>
                            <button className="close" onClick={() => setRunDetail(null)}><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body" style={{ padding: 20 }}>
                            <div className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                                criado {fmtDate(runDetail.createdAt)}{runDetail.finishedAt ? ` · concluído ${fmtDate(runDetail.finishedAt)}` : ''}
                            </div>
                            {runDetail.error && <div className="notice danger"><i className="ti ti-alert-circle" />{runDetail.error}</div>}
                            <div className="section-title" style={{ fontSize: 13 }}>Parâmetros</div>
                            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--color-bg-secondary)', padding: 12, borderRadius: 10, marginBottom: 14 }}>{JSON.stringify(runDetail.params || {}, null, 2)}</pre>
                            <div className="section-title" style={{ fontSize: 13 }}>Resultado</div>
                            <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', background: 'var(--color-bg-secondary)', padding: 12, borderRadius: 10 }}>{JSON.stringify(runDetail.stats || {}, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
