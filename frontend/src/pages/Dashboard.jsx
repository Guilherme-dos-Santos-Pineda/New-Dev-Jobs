import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { scoreClass, fmtDate } from '../utils.js';
import FeedbackSection from '../components/FeedbackSection.jsx';
import SearchSendModal from '../components/SearchSendModal.jsx';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');

export default function Dashboard() {
    const { user } = useAuth();
    const [stats, setStats] = useState(null);
    const [profile, setProfile] = useState(null);
    const [ranking, setRanking] = useState([]);
    const [rankMetric, setRankMetric] = useState('');
    const [loading, setLoading] = useState(true);

    // Procurar vagas + fila de envio
    const [searchOpen, setSearchOpen] = useState(false);
    const [queue, setQueue] = useState(null);
    const pollRef = useRef(null);

    async function loadAll() {
        const [s, { profile }, r] = await Promise.all([api.getStats(), api.getProfile(), api.getRanking()]);
        setStats(s); setProfile(profile);
        setRanking(r.ranking); setRankMetric(r.metric);
        setLoading(false);
    }

    function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }
    async function refreshQueue() {
        try {
            const { status } = await api.queueStatus();
            setQueue(status);
            if (!status.active) { stopPolling(); loadAll(); }
        } catch { /* ignore */ }
    }
    function startPolling() { stopPolling(); refreshQueue(); pollRef.current = setInterval(refreshQueue, 3000); }

    useEffect(() => { loadAll(); refreshQueue(); return stopPolling; // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) return <div className="page center"><div className="spinner" /></div>;

    const steps = [
        { done: !!profile, label: 'Monte seu perfil técnico', to: '/app/perfil', cta: 'Completar perfil' },
        { done: !!profile?.hasCv, label: 'Envie seu currículo (PDF)', to: '/app/perfil?section=contact', cta: 'Enviar CV' },
        { done: user?.googleConnected, label: 'Conecte sua conta Google', to: '/app/perfil?tab=email', cta: 'Conectar Google' },
    ];
    const pending = steps.filter((s) => !s.done);

    const q = queue;
    const qActive = q && (q.active || q.pending > 0);

    return (
        <div className="page">
            <div className="page-head row" style={{ alignItems: 'flex-start' }}>
                <div>
                    <h1>Olá, {user?.name?.split(' ')[0] || 'dev'} 👋</h1>
                    <p>Acompanhe suas candidaturas automáticas.</p>
                </div>
                <div className="spacer" />
                <button className="btn primary" onClick={() => setSearchOpen(true)}>
                    <i className="ti ti-radar-2" /> Procurar Vagas
                </button>
            </div>

            {/* Banner de progresso da fila de envio */}
            {q && q.total > 0 && (
                <div className="card queue-banner" style={{ marginBottom: 24 }}>
                    <div className="qb-ico"><i className={`ti ${qActive ? 'ti-send' : 'ti-circle-check'}`} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>
                            {qActive ? 'Enviando candidaturas…' : 'Envios concluídos'}
                            <span className="muted" style={{ fontWeight: 400 }}> · {q.sent} de {q.total}</span>
                        </div>
                        <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${Math.round((q.sent + q.failed + q.skipped) / q.total * 100)}%` }} /></div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {qActive
                                ? <>próximo envio em ~{q.nextInSeconds ?? '…'}s · espaçamento anti-bloqueio (60–120s){q.failed ? ` · ${q.failed} falhou` : ''}</>
                                : <>{q.sent} enviadas{q.skipped ? `, ${q.skipped} já feitas` : ''}{q.failed ? `, ${q.failed} falharam` : ''}</>}
                        </div>
                    </div>
                    {qActive
                        ? <button className="btn sm" onClick={async () => { await api.queueStop(); refreshQueue(); }}><i className="ti ti-player-stop" /> Parar</button>
                        : <button className="btn ghost sm" onClick={() => setQueue(null)}><i className="ti ti-x" /></button>}
                </div>
            )}

            {pending.length > 0 && (
                <div className="card" style={{ marginBottom: 28 }}>
                    <div className="section-title">Conclua sua configuração ({steps.length - pending.length}/{steps.length})</div>
                    <div className="job-list">
                        {steps.map((s, i) => (
                            <div key={i} className="row" style={{ alignItems: 'center' }}>
                                <i className={`ti ${s.done ? 'ti-circle-check-filled' : 'ti-circle'}`}
                                    style={{ fontSize: 20, color: s.done ? 'var(--color-success)' : 'var(--color-text-tertiary)' }} />
                                <span style={{ textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--color-text-tertiary)' : 'var(--color-text)' }}>{s.label}</span>
                                <div className="spacer" />
                                {!s.done && <Link to={s.to} className="btn sm">{s.cta}</Link>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ---- Stats ---- */}
            <div className="stats-grid">
                <div className="card stat">
                    <div className="stat-l"><i className="ti ti-briefcase" /> vagas coletadas</div>
                    <div className="stat-n">{nf(stats.jobs.total)}</div>
                    <div className="stat-delta">+{nf(stats.jobs.today)} hoje</div>
                </div>
                <div className="card stat">
                    <div className="stat-l"><i className="ti ti-send" /> suas candidaturas</div>
                    <div className="stat-n">{nf(stats.applications.total)}</div>
                    <div className="stat-delta">+{nf(stats.applications.week)} na semana</div>
                </div>
                <div className="card stat">
                    <div className="stat-l"><i className="ti ti-world" /> candidaturas gerais</div>
                    <div className="stat-n">{nf(stats.general.total)}</div>
                    <div className="stat-delta">+{nf(stats.general.today)} hoje</div>
                </div>
                <div className="card stat">
                    <div className="stat-l"><i className="ti ti-target" /> match médio</div>
                    <div className="stat-n">{stats.applications.avgMatch}%</div>
                    <div className="stat-sub">{stats.applications.remainingToday} envios restantes hoje</div>
                </div>
            </div>

            {/* ---- Ranking + Recentes ---- */}
            <div className="row" style={{ alignItems: 'stretch', marginBottom: 20 }}>
                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="section-title"><i className="ti ti-trophy" /> Ranking de usuários</div>
                    <p className="muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 12 }}>Top 10 por {rankMetric}</p>
                    {ranking.length === 0 ? (
                        <div className="empty" style={{ padding: 20 }}><i className="ti ti-trophy-off" />Ninguém enviou e-mails hoje ainda.</div>
                    ) : ranking.map((r) => (
                        <div key={r.position} className="rank-row">
                            <span className={`rank-pos ${r.position <= 3 ? 'top' : ''}`}>{r.position}</span>
                            <span className="rank-name">{r.name}{r.me && <span className="badge ok" style={{ marginLeft: 8 }}>você</span>}</span>
                            <span className="rank-sent">{r.sent} e-mails</span>
                        </div>
                    ))}
                </div>

                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
                        <div className="section-title" style={{ margin: 0 }}><i className="ti ti-history" /> Candidaturas recentes</div>
                        <div className="spacer" />
                        <Link to="/app/candidaturas" className="btn sm ghost">ver todas <i className="ti ti-arrow-right" /></Link>
                    </div>
                    {stats.recent.length === 0 ? (
                        <div className="empty" style={{ padding: 20 }}>
                            <i className="ti ti-inbox" />Nenhuma candidatura ainda.
                            <div style={{ marginTop: 12 }}>
                                <button className="btn primary sm" onClick={() => setSearchOpen(true)}><i className="ti ti-radar-2" /> Procurar vagas</button>
                            </div>
                        </div>
                    ) : stats.recent.map((r) => (
                        <div key={r.id} className="rank-row">
                            <div className="job-logo" style={{ width: 32, height: 32, fontSize: 15 }}><i className="ti ti-building" /></div>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title || 'Vaga'}</div>
                                <div className="muted" style={{ fontSize: 12 }}>{r.company} · {fmtDate(r.createdAt)}</div>
                            </div>
                            <span className={`score ${scoreClass(r.matchScore)}`} style={{ marginLeft: 'auto' }}>{r.matchScore}%</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ---- Feedback (5 últimos, compacto) ---- */}
            <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}><i className="ti ti-message-2" /> Últimos feedbacks</div>
                <div className="spacer" />
                <Link to="/app/feedback" className="btn sm ghost">ver todos / avaliar <i className="ti ti-arrow-right" /></Link>
            </div>
            <FeedbackSection limit={5} compact title={false} />

            {searchOpen && <SearchSendModal onClose={() => setSearchOpen(false)} onStarted={startPolling} />}
        </div>
    );
}
