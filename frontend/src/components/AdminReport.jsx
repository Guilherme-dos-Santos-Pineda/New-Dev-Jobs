import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import Sparkline from './Sparkline.jsx';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const usd = (n) => (n == null ? '—' : `US$${Number(n).toFixed(2)}`);

// Relatório de custo × coleta: gasto real da Apify cruzado com as vagas coletadas,
// para medir "quantas vagas por dólar" e projetar até onde o crédito grátis leva.
export default function AdminReport() {
    const toast = useToast();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        setLoading(true);
        try { setData(await api.adminReport()); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (loading) return <div className="card center" style={{ padding: 40 }}><div className="spinner" /></div>;
    if (!data) return null;

    const { jobs, runs, apify, timeline, efficiency: eff } = data;
    const spark = (timeline || []).map((t) => t.c);
    const usedPct = apify?.totalFree ? Math.min(100, Math.round((apify.totalUsed / apify.totalFree) * 100)) : 0;

    const cards = [
        { l: 'Vagas (total)', v: nf(jobs.total), i: 'ti-briefcase' },
        { l: 'Vagas no mês', v: nf(jobs.month), i: 'ti-calendar-month' },
        { l: 'Na semana', v: nf(jobs.week), i: 'ti-calendar-week' },
        { l: 'Coletadas hoje', v: nf(jobs.today), i: 'ti-clock' },
        { l: 'Com email (candidatável)', v: nf(jobs.with_email), i: 'ti-mail' },
        { l: 'Custo por vaga', v: eff.costPerJob ? usd(eff.costPerJob) : '—', i: 'ti-coin', sub: 'gasto Apify ÷ vagas do mês' },
    ];

    return (
        <>
            <div className="cards-grid" style={{ marginBottom: 18 }}>
                {cards.map((c) => (
                    <div key={c.l} className="card kpi">
                        <div className="kpi-top"><span className="kpi-ico"><i className={`ti ${c.i}`} /></span><span className="kpi-label">{c.l}</span></div>
                        <div className="kpi-num">{c.v}</div>
                        {c.sub && <div className="kpi-foot"><span className="muted">{c.sub}</span></div>}
                    </div>
                ))}
            </div>

            <div className="row" style={{ alignItems: 'stretch' }}>
                {/* Custo Apify (mês) */}
                <div className="card" style={{ flex: 1.2, minWidth: 320 }}>
                    <div className="row" style={{ alignItems: 'center', marginBottom: 10 }}>
                        <div className="section-title" style={{ margin: 0 }}><i className="ti ti-cash" /> Custo Apify (mês)</div>
                        <div className="spacer" />
                        <button className="btn ghost sm" onClick={load}><i className="ti ti-refresh" /></button>
                    </div>
                    {apify?.error ? (
                        <div className="notice danger"><i className="ti ti-alert-circle" />Não foi possível ler o uso da Apify: {apify.error}</div>
                    ) : (
                        <>
                            <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                                <span className="muted">Gasto do free tier</span>
                                <span className="mono"><b>{usd(apify.totalUsed)}</b> / {usd(apify.totalFree)}</span>
                            </div>
                            <div className="progress"><span style={{ width: `${usedPct}%`, background: usedPct >= 90 ? 'var(--color-danger)' : undefined }} /></div>
                            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Restam <b>{usd(apify.totalRemaining)}</b> grátis este mês · {apify.accounts.length} conta(s).</div>
                            <div style={{ marginTop: 14 }}>
                                {apify.accounts.map((a) => {
                                    const pct = a.usedUsd == null ? 0 : Math.min(100, Math.round((a.usedUsd / a.freeUsd) * 100));
                                    return (
                                        <div key={a.label} style={{ marginBottom: 9 }}>
                                            <div className="row" style={{ justifyContent: 'space-between', fontSize: 12 }}>
                                                <span>{a.label} <span className="mono muted">{a.tokenHint}</span></span>
                                                <span className="mono muted">{a.error ? 'erro' : `${usd(a.usedUsd)} / ${usd(a.freeUsd)}`}</span>
                                            </div>
                                            <div className="progress" style={{ height: 6, marginTop: 3 }}><span style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--color-danger)' : undefined }} /></div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>

                {/* Eficiência / projeção */}
                <div className="card" style={{ flex: 1, minWidth: 280 }}>
                    <div className="section-title"><i className="ti ti-target-arrow" /> Eficiência</div>
                    <div className="stat"><div className="stat-l">Custo por vaga coletada</div>
                        <div className="stat-n" style={{ fontSize: 26 }}>{eff.costPerJob ? usd(eff.costPerJob) : '—'}</div></div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                        {eff.jobsPerDollar ? <>≈ <b>{nf(eff.jobsPerDollar)}</b> vagas por US$1</> : 'sem dados suficientes ainda'}
                    </div>
                    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border-light)' }}>
                        <div className="stat-l">Projeção até o free tier acabar</div>
                        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color: 'var(--color-accent)' }}>
                            {eff.projectedLeft != null ? `+${nf(eff.projectedLeft)} vagas` : '—'}
                        </div>
                        <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>estimativa com o custo/vaga atual e o crédito restante</div>
                    </div>
                </div>
            </div>

            {/* Timeline */}
            <div className="card" style={{ marginTop: 14 }}>
                <div className="section-title"><i className="ti ti-chart-line" /> Vagas coletadas por dia (14 dias)</div>
                {spark.every((v) => v === 0) ? (
                    <div className="empty" style={{ padding: 20 }}><i className="ti ti-chart-line" />Sem coletas nos últimos 14 dias.</div>
                ) : (
                    <>
                        <div className="spark" style={{ height: 64, marginTop: 6 }}><Sparkline data={spark} height={64} /></div>
                        <div className="row" style={{ justifyContent: 'space-between', fontSize: 10.5, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                            <span>{timeline[0]?.day}</span>
                            <span>{timeline[Math.floor(timeline.length / 2)]?.day}</span>
                            <span>{timeline.at(-1)?.day} (hoje)</span>
                        </div>
                    </>
                )}
            </div>

            {/* Funil do scraper (mês) */}
            <div className="card" style={{ marginTop: 14 }}>
                <div className="section-title"><i className="ti ti-filter" /> Funil do scraper (mês)</div>
                <div className="cards-grid">
                    {[
                        { l: 'Posts encontrados', v: nf(runs.found), i: 'ti-search' },
                        { l: 'Viraram vaga', v: nf(runs.novos), i: 'ti-circle-plus' },
                        { l: 'Duplicadas', v: nf(runs.duplicados), i: 'ti-copy' },
                        { l: 'Sem email', v: nf(runs.sem_email), i: 'ti-mail-off' },
                        { l: 'Descartadas IA', v: nf(runs.descartados), i: 'ti-filter-x' },
                        { l: 'Runs (falhas)', v: `${nf(runs.runs)} (${nf(runs.failed)})`, i: 'ti-player-play' },
                    ].map((c) => (
                        <div key={c.l} className="card kpi">
                            <div className="kpi-top"><span className="kpi-ico"><i className={`ti ${c.i}`} /></span><span className="kpi-label">{c.l}</span></div>
                            <div className="kpi-num">{c.v}</div>
                        </div>
                    ))}
                </div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 10 }}>
                    Funil conforme registrado nos runs (parcial — runs sem crédito/falhos não gravam stats). A contagem confiável de vagas vem da tabela Jobs (cards acima). Custo/vaga = gasto real Apify ÷ vagas do mês.
                </div>
            </div>
        </>
    );
}
