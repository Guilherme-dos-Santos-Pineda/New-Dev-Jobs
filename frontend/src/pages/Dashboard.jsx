import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { scoreClass, fmtDate } from '../utils.js';
import FeedbackSection from '../components/FeedbackSection.jsx';
import SearchSendModal from '../components/SearchSendModal.jsx';
import Sparkline from '../components/Sparkline.jsx';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const fmtSaved = (min) => {
    if (!min) return '0 min';
    const h = Math.floor(min / 60);
    return h >= 1 ? `${h}h${min % 60 ? ` ${min % 60}m` : ''}` : `${min} min`;
};
const timeAgo = (d) => {
    const s = (Date.now() - new Date(d)) / 1000;
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.floor(s / 60)} min`;
    if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
    return `há ${Math.floor(s / 86400)} d`;
};

export default function Dashboard() {
    const { user } = useAuth();
    const { t } = useT();
    // Cada recurso é cacheado: ao voltar para a home (ou após prefetch no hover do
    // menu) os dados aparecem na hora e revalidam em silêncio. As três chamadas
    // continuam em paralelo, agora deduplicadas pelo cache.
    const { data, loading, refresh: refreshDash } = useCachedResource('dashboard', () => api.getDashboard());
    const { data: profData } = useCachedResource('profile', () => api.getProfile());
    const { data: rankData, refresh: refreshRank } = useCachedResource('ranking', () => api.getRanking());
    const profile = profData?.profile;
    const ranking = rankData?.ranking || [];
    const rankMetric = rankData?.metric || '';

    const [searchOpen, setSearchOpen] = useState(false);
    const [queue, setQueue] = useState(null);
    const pollRef = useRef(null);

    function refreshData() { refreshDash(); refreshRank(); }

    function stopPolling() { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }
    async function refreshQueue() {
        if (document.hidden) return; // não bate a API com a aba em segundo plano
        try {
            const { status } = await api.queueStatus();
            setQueue(status);
            if (!status.active) { stopPolling(); refreshData(); }
        } catch { /* ignore */ }
    }
    function startPolling() { stopPolling(); refreshQueue(); pollRef.current = setInterval(refreshQueue, 3000); }

    useEffect(() => {
        // Só faz polling se já houver fila ativa/pendente (ex.: page reload no meio
        // de um envio). Sem fila, fazemos uma única leitura para mostrar o banner.
        (async () => {
            try {
                const { status } = await api.queueStatus();
                setQueue(status);
                if (status.active || status.pending > 0) startPolling();
            } catch { /* ignore */ }
        })();
        return stopPolling; // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const m = data?.metrics;

    const kpis = m ? [
        { label: t('Vagas hoje'), icon: 'ti-briefcase', value: nf(m.jobsToday), sub: `${nf(m.jobsTotal)} ${t('no total')}`, spark: data.sparkJobs },
        { label: t('Vagas compatíveis'), icon: 'ti-checklist', value: nf(m.compatible), sub: t('prontas para enviar') },
        { label: t('Recrutadores'), icon: 'ti-address-book', value: nf(m.recruiters), sub: `${nf(m.recruitersApproved)} ${t('aprovados')}` },
        { label: t('Empresas monitoradas'), icon: 'ti-building', value: nf(m.companies), sub: t('com vagas coletadas') },
        { label: t('Currículos enviados'), icon: 'ti-send', value: nf(m.sentTotal), sub: `+${nf(m.sentWeek)} ${t('na semana')}`, spark: data.sparkSent, color: 'var(--color-success)' },
        { label: t('Match acima de 90%'), icon: 'ti-target', value: nf(m.matchesAbove90), sub: `${t('match médio')} ${m.avgMatch}%` },
        { label: t('Tempo economizado'), icon: 'ti-clock-bolt', value: fmtSaved(m.timeSavedMin), sub: t('pela automação') },
        { label: t('Envios restantes hoje'), icon: 'ti-gauge', value: nf(m.remainingToday), sub: `${t('de')} ${nf(m.dailyLimit)} ${t('do plano')}` },
    ] : [];

    const steps = [
        {
            done: !!profile?.areas?.length, icon: 'ti-briefcase', highlight: true,
            label: 'Escolha sua área profissional',
            hint: 'Define quais vagas você recebe (ex.: um QA não recebe vaga de Dev).',
            to: '/app/perfil?section=work', cta: 'Escolher área',
        },
        {
            done: !!profile?.skills?.length, icon: 'ti-tags',
            label: 'Adicione suas skills e keywords',
            hint: 'Calculam o match de cada vaga com o seu perfil.',
            to: '/app/perfil?section=skills', cta: 'Adicionar skills',
        },
        {
            done: !!profile?.hasCv, icon: 'ti-paperclip',
            label: 'Envie seu currículo (PDF)',
            hint: 'É o PDF anexado nas suas candidaturas.',
            to: '/app/perfil?section=contact', cta: 'Enviar CV',
        },
        {
            done: user?.googleConnected, icon: 'ti-brand-google',
            label: 'Conecte sua conta Google',
            hint: 'Os emails são enviados do seu Gmail.',
            to: '/app/perfil?tab=email', cta: 'Conectar Google',
        },
    ];
    const pending = steps.filter((s) => !s.done);
    const q = queue;
    const qActive = q && (q.active || q.pending > 0);

    return (
        <div className="page">
            <div className="page-head row" style={{ alignItems: 'flex-start' }}>
                <div>
                    <h1>{t('Olá, {name}', { name: user?.name?.split(' ')[0] || 'dev' })}</h1>
                    <p>{t('Seu radar de oportunidades, em tempo real.')}</p>
                </div>
                <div className="spacer" />
                <button className="btn primary" onClick={() => setSearchOpen(true)}>
                    <i className="ti ti-radar-2" /> {t('Procurar Vagas')}
                </button>
            </div>

            {/* Banner da fila de envio */}
            {q && q.total > 0 && (
                <div className="card queue-banner fade-in" style={{ marginBottom: 20 }}>
                    <div className="qb-ico"><i className={`ti ${qActive ? 'ti-send' : 'ti-circle-check'}`} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>
                            {qActive ? 'Enviando candidaturas…' : 'Envios concluídos'}
                            <span className="muted" style={{ fontWeight: 400 }}> · {q.sent} de {q.total}</span>
                        </div>
                        <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${Math.round((q.sent + q.failed + q.skipped) / q.total * 100)}%` }} /></div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                            {qActive
                                ? <>próximo envio em ~{q.nextInSeconds ?? '…'}s · espaçamento anti-bloqueio{q.failed ? ` · ${q.failed} falhou` : ''}</>
                                : <>{q.sent} enviadas{q.skipped ? `, ${q.skipped} já feitas` : ''}{q.failed ? `, ${q.failed} falharam` : ''}</>}
                        </div>
                    </div>
                    {qActive
                        ? <button className="btn sm" onClick={async () => { await api.queueStop(); refreshQueue(); }}><i className="ti ti-player-stop" /> Parar</button>
                        : <button className="btn ghost sm" onClick={() => setQueue(null)}><i className="ti ti-x" /></button>}
                </div>
            )}

            {/* Onboarding */}
            {!loading && pending.length > 0 && (
                <div className="card fade-in" style={{ marginBottom: 22 }}>
                    <div className="section-title">{t('Conclua sua configuração')} ({steps.length - pending.length}/{steps.length})</div>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>
                        {t('Quanto mais completo o perfil, mais certeiras são as vagas que você recebe.')}
                    </p>
                    <div className="job-list">
                        {steps.map((s, i) => (
                            <div key={i} className="row" style={{ alignItems: 'flex-start', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--color-border-light)' : 'none' }}>
                                <i className={`ti ${s.done ? 'ti-circle-check-filled' : s.icon}`}
                                    style={{ fontSize: 22, marginTop: 1, flexShrink: 0, color: s.done ? 'var(--color-success)' : (s.highlight ? 'var(--color-accent)' : 'var(--color-text-tertiary)') }} />
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                                        <span style={{ fontWeight: 600, textDecoration: s.done ? 'line-through' : 'none', color: s.done ? 'var(--color-text-tertiary)' : 'var(--color-text)' }}>{t(s.label)}</span>
                                        {s.highlight && !s.done && <span className="badge ok">{t('recomendado')}</span>}
                                    </div>
                                    {!s.done && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>{t(s.hint)}</div>}
                                </div>
                                {!s.done && <Link to={s.to} className="btn sm" style={{ flexShrink: 0 }}>{t(s.cta)}</Link>}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Comunidade no WhatsApp */}
            <a className="card fade-in comm-banner" href="https://chat.whatsapp.com/KqCxMcuoALJHXd9I9VA6KG"
                target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
                <div className="kpi-ico" style={{ width: 38, height: 38, fontSize: 20, color: '#25D366' }}><i className="ti ti-brand-whatsapp" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t('Venha fazer parte da comunidade')}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{t('Dicas de vagas, novidades e suporte no WhatsApp.')}</div>
                </div>
                <i className="ti ti-arrow-right" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
            </a>

            {/* KPIs */}
            <div className="cards-grid" style={{ marginBottom: 20 }}>
                {loading
                    ? [0, 1, 2, 3, 4, 5, 6, 7].map((i) => <div key={i} className="skeleton sk-card" />)
                    : kpis.map((k, i) => (
                        <div key={k.label} className={`card kpi fade-in d${(i % 6) + 1}`}>
                            <div className="kpi-top"><span className="kpi-ico"><i className={`ti ${k.icon}`} /></span><span className="kpi-label">{k.label}</span></div>
                            <div className="kpi-num">{k.value}</div>
                            {k.spark ? <div className="spark"><Sparkline data={k.spark} color={k.color} /></div> : null}
                            <div className="kpi-foot"><span className="muted">{k.sub}</span></div>
                        </div>
                    ))}
            </div>

            {/* Skeleton dos blocos abaixo dos KPIs (espelha o layout final) */}
            {loading && (
                <>
                    <div className="row" style={{ alignItems: 'stretch', marginBottom: 20 }}>
                        <div className="skeleton sk-card" style={{ flex: 1.1, minWidth: 300, height: 190 }} />
                        <div className="skeleton sk-card" style={{ flex: 1, minWidth: 300, height: 190 }} />
                    </div>
                    <div className="row" style={{ alignItems: 'stretch', marginBottom: 20 }}>
                        <div className="skeleton sk-card" style={{ flex: 1, minWidth: 300, height: 210 }} />
                        <div className="skeleton sk-card" style={{ flex: 1, minWidth: 300, height: 210 }} />
                    </div>
                </>
            )}

            {/* Próxima melhor oportunidade + Central de atividades */}
            {!loading && data && (
                <div className="row" style={{ alignItems: 'stretch', marginBottom: 20 }}>
                    <div className="card feature-card fade-in" style={{ flex: 1.1, minWidth: 300, display: 'flex', flexDirection: 'column' }}>
                        <div className="kpi-label" style={{ fontSize: 12.5 }}><i className="ti ti-bolt" /> {t('Próxima melhor oportunidade')}</div>
                        {data.nextBest ? (
                            <>
                                <div style={{ fontSize: 19, fontWeight: 700, marginTop: 10, lineHeight: 1.25 }}>{data.nextBest.title || 'Vaga'}</div>
                                <div style={{ opacity: 0.9, marginTop: 4 }}>{data.nextBest.company || '—'}</div>
                                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                    <span className="badge" style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}><i className="ti ti-target" /> {data.nextBest.matchScore}% match</span>
                                    {(data.nextBest.skills || []).map((s) => <span key={s} className="badge" style={{ background: 'rgba(255,255,255,.14)', color: '#fff' }}>{s}</span>)}
                                </div>
                                <div style={{ marginTop: 'auto', paddingTop: 16 }}>
                                    <button className="btn" onClick={() => setSearchOpen(true)}><i className="ti ti-send" /> {t('Candidatar agora')}</button>
                                </div>
                            </>
                        ) : (
                            <div style={{ marginTop: 16, opacity: 0.9 }}>Sem vagas compatíveis no momento. Rode "Procurar Vagas" ou ajuste seu perfil.</div>
                        )}
                    </div>

                    <div className="card fade-in d2" style={{ flex: 1, minWidth: 300 }}>
                        <div className="section-title"><i className="ti ti-activity" /> {t('Central de atividades')}</div>
                        {(!data.activities || data.activities.length === 0) ? (
                            <div className="empty" style={{ padding: 22 }}><i className="ti ti-activity-heartbeat" />Sem atividade ainda.</div>
                        ) : (
                            <div className="timeline">
                                {data.activities.map((a, i) => (
                                    <div key={i} className="tl-item">
                                        <div className={`tl-dot ${a.type}`}><i className={`ti ${a.icon}`} /></div>
                                        <div className="tl-body">
                                            <div className="tl-title">{a.text}</div>
                                            <div className="tl-time">{timeAgo(a.at)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Ranking + Candidaturas recentes */}
            {!loading && data && (
                <div className="row" style={{ alignItems: 'stretch', marginBottom: 20 }}>
                    <div className="card fade-in" style={{ flex: 1, minWidth: 300 }}>
                        <div className="section-title"><i className="ti ti-trophy" /> {t('Ranking de usuários')}</div>
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

                    <div className="card fade-in d2" style={{ flex: 1, minWidth: 300 }}>
                        <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
                            <div className="section-title" style={{ margin: 0 }}><i className="ti ti-history" /> {t('Candidaturas recentes')}</div>
                            <div className="spacer" />
                            <Link to="/app/candidaturas" className="btn sm ghost">{t('ver todas')} <i className="ti ti-arrow-right" /></Link>
                        </div>
                        {(!data.recent || data.recent.length === 0) ? (
                            <div className="empty" style={{ padding: 20 }}>
                                <i className="ti ti-inbox" />Nenhuma candidatura ainda.
                                <div style={{ marginTop: 12 }}><button className="btn primary sm" onClick={() => setSearchOpen(true)}><i className="ti ti-radar-2" /> Procurar vagas</button></div>
                            </div>
                        ) : data.recent.map((r) => (
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
            )}

            {/* Feedback */}
            <div className="row" style={{ alignItems: 'center', marginBottom: 12 }}>
                <div className="section-title" style={{ margin: 0 }}><i className="ti ti-message-2" /> {t('Últimos feedbacks')}</div>
                <div className="spacer" />
                <Link to="/app/feedback" className="btn sm ghost">{t('ver todos / avaliar')} <i className="ti ti-arrow-right" /></Link>
            </div>
            <FeedbackSection limit={5} compact title={false} />

            {searchOpen && <SearchSendModal onClose={() => setSearchOpen(false)} onStarted={startPolling} />}
        </div>
    );
}
