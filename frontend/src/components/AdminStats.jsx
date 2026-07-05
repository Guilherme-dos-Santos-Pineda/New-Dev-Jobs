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

    const { raw, jobs, ai, apify, runs, dedup } = data;
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

            {dedup && (
                <div className="card" style={{ marginBottom: 18 }}>
                    <div className="section-title"><i className="ti ti-copy" /> Deduplicação (monitoramento)</div>
                    <div className="cards-grid">
                        {[
                            { l: 'Total bruto encontrado', v: nf(dedup.found), i: 'ti-search' },
                            { l: 'Aproveitado (novas)', v: nf(dedup.novos), i: 'ti-circle-plus' },
                            { l: 'Duplicado', v: nf(dedup.duplicados), i: 'ti-copy' },
                            { l: 'Descartado pela IA', v: nf(dedup.descartados), i: 'ti-filter-x' },
                            { l: 'Taxa de duplicação', v: `${dedup.taxaDuplicacao}%`, i: 'ti-percentage' },
                        ].map((c) => (
                            <div key={c.l} className="card kpi">
                                <div className="kpi-top"><span className="kpi-ico"><i className={`ti ${c.i}`} /></span><span className="kpi-label">{c.l}</span></div>
                                <div className="kpi-num">{c.v}</div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {apify && apify.accounts && (() => {
                const usdf = (n) => (n == null ? '—' : `US$${Number(n).toFixed(2)}`);
                const withCredit = apify.accounts.filter((a) => (a.remainingUsd ?? 0) > 0.05).length;
                return (
                    <div className="card" style={{ marginBottom: 18 }}>
                        <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
                            <div className="section-title" style={{ margin: 0 }}><i className="ti ti-robot" /> Contas Apify (uso real do mês)</div>
                            <span className={`badge ${withCredit > 0 ? 'ok' : 'danger'}`} style={{ marginLeft: 10 }}>{withCredit}/{apify.accounts.length} com crédito</span>
                            <div className="spacer" />
                            <span className="mono muted" style={{ fontSize: 12 }}>{usdf(apify.totalUsed)} / {usdf(apify.totalFree)}</span>
                        </div>
                        {apify.accounts.length === 0 ? (
                            <div className="muted" style={{ fontSize: 12.5 }}>Nenhuma conta configurada. Defina <code>APIFY_TOKEN</code> (e <code>APIFY_TOKEN_2..5</code> para fallback).</div>
                        ) : (
                            <div className="job-list">
                                {apify.accounts.map((a) => {
                                    const exhausted = (a.remainingUsd ?? 0) <= 0.05;
                                    const pct = a.usedUsd == null ? 0 : Math.min(100, Math.round((a.usedUsd / a.freeUsd) * 100));
                                    return (
                                        <div key={a.label} style={{ padding: '8px 0', borderTop: '1px solid var(--color-border-light)' }}>
                                            <div className="row" style={{ alignItems: 'center', gap: 10 }}>
                                                <span className={`badge ${a.error ? 'neutral' : exhausted ? 'danger' : 'ok'}`}>{a.error ? 'erro' : exhausted ? 'sem crédito' : 'ok'}</span>
                                                <div style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>{a.label} <span className="mono muted" style={{ fontWeight: 400 }}>{a.tokenHint}</span></div>
                                                <span className="mono muted" style={{ fontSize: 12 }}>{a.error ? a.error.slice(0, 24) : `${usdf(a.usedUsd)} / ${usdf(a.freeUsd)}`}</span>
                                            </div>
                                            {!a.error && <div className="progress" style={{ height: 5, marginTop: 5 }}><span style={{ width: `${pct}%`, background: exhausted ? 'var(--color-danger)' : undefined }} /></div>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>Gasto real via API da Apify (free tier US$5/conta/mês). A rotação usa uma conta por vez e pula quando o crédito esgota. Detalhes e projeção na aba <b>Relatório</b>.</div>
                    </div>
                );
            })()}

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
