import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { fmtDate } from '../utils.js';
import BotsPanel from '../components/BotsPanel.jsx';
import AdminJobs from '../components/AdminJobs.jsx';
import AdminRecruiters from '../components/AdminRecruiters.jsx';
import AdminRawContent from '../components/AdminRawContent.jsx';
import AdminStats from '../components/AdminStats.jsx';
import AdminUsers from '../components/AdminUsers.jsx';

const nf = (n) => (n ?? 0).toLocaleString('pt-BR');

export default function Admin() {
    const { user } = useAuth();
    const toast = useToast();
    const [overview, setOverview] = useState(null);
    const [sources, setSources] = useState([]);
    const [loading, setLoading] = useState(true);
    const [url, setUrl] = useState('');
    const [label, setLabel] = useState('');
    const [adding, setAdding] = useState(false);
    const [tab, setTab] = useState('geral');

    async function load() {
        try {
            const [o, s] = await Promise.all([api.adminOverview(), api.adminGetSources()]);
            setOverview(o);
            setSources(s.sources);
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            setLoading(false);
        }
    }
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!user?.isAdmin) return <Navigate to="/app" replace />;

    async function addSource(e) {
        e.preventDefault();
        if (!url.trim()) return;
        setAdding(true);
        try {
            await api.adminAddSource(url, label);
            setUrl(''); setLabel('');
            await load();
            toast.show('Recrutador adicionado à lista do scraper');
        } catch (err) { toast.show(err.message, 'error'); }
        finally { setAdding(false); }
    }

    async function toggle(s) {
        await api.adminToggleSource(s.id, !s.active);
        setSources((prev) => prev.map((x) => (x.id === s.id ? { ...x, active: !x.active } : x)));
    }

    async function remove(s) {
        if (!window.confirm(`Remover ${s.label || s.url}?`)) return;
        await api.adminDeleteSource(s.id);
        setSources((prev) => prev.filter((x) => x.id !== s.id));
        toast.show('Fonte removida');
    }

    if (loading) return <div className="page center"><div className="spinner" /></div>;

    const st = overview?.stats || {};

    return (
        <div className="page">
            <div className="page-head">
                <h1><i className="ti ti-shield-cog" style={{ color: 'var(--color-accent)' }} /> Admin</h1>
                <p>Controle da plataforma, planos e bots do scraper.</p>
            </div>

            <div className="segmented" style={{ marginBottom: 18 }}>
                {[
                    ['geral', 'Visão geral', 'ti-layout-dashboard'],
                    ['usuarios', 'Usuários', 'ti-users'],
                    ['vagas', 'Vagas', 'ti-briefcase'],
                    ['recrutadores', 'Recrutadores', 'ti-address-book'],
                    ['bots', 'Bots & Scraper', 'ti-robot'],
                    ['raw', 'Conteúdo bruto', 'ti-file-text'],
                    ['stats', 'Estatísticas', 'ti-chart-bar'],
                ].map(([id, label, icon]) => (
                    <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                        <i className={`ti ${icon}`} /> {label}
                    </button>
                ))}
            </div>

            {tab === 'bots' && <BotsPanel />}
            {tab === 'usuarios' && <AdminUsers />}
            {tab === 'vagas' && <AdminJobs />}
            {tab === 'recrutadores' && <AdminRecruiters />}
            {tab === 'raw' && <AdminRawContent />}
            {tab === 'stats' && <AdminStats />}

            {tab === 'geral' && (<>
            {/* ---- Números da plataforma ---- */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(7, 1fr)' }}>
                {[
                    { l: 'usuários', v: st.users, i: 'ti-users' },
                    { l: 'vagas', v: st.jobs, i: 'ti-briefcase' },
                    { l: 'candidaturas', v: st.applications, i: 'ti-send' },
                    { l: 'na fila', v: st.queued, i: 'ti-hourglass' },
                    { l: 'feedbacks', v: st.feedback, i: 'ti-message-2' },
                    { l: 'recrutadores', v: st.recruiters, i: 'ti-address-book' },
                    { l: 'fontes', v: st.sources, i: 'ti-spider' },
                ].map((c) => (
                    <div key={c.l} className="card stat" style={{ padding: 16 }}>
                        <div className="stat-l"><i className={`ti ${c.i}`} /> {c.l}</div>
                        <div className="stat-n" style={{ fontSize: 24 }}>{nf(c.v)}</div>
                    </div>
                ))}
            </div>

            <div className="row" style={{ alignItems: 'flex-start' }}>
                {/* ---- Fontes de recrutadores ---- */}
                <div className="card" style={{ flex: 1.2, minWidth: 340 }}>
                    <div className="section-title"><i className="ti ti-spider" /> Recrutadores monitorados (scraper)</div>
                    <p className="muted" style={{ fontSize: 12.5, marginTop: -6, marginBottom: 14 }}>
                        O scraper busca vagas nos posts destes perfis do LinkedIn (`npm run scrape`).
                    </p>

                    <form onSubmit={addSource} className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                        <input className="input" style={{ flex: 2, minWidth: 220 }} value={url}
                            onChange={(e) => setUrl(e.target.value)} placeholder="linkedin.com/in/recrutador" />
                        <input className="input" style={{ flex: 1, minWidth: 120 }} value={label}
                            onChange={(e) => setLabel(e.target.value)} placeholder="Nome (opcional)" />
                        <button className="btn primary sm" disabled={adding || !url.trim()} style={{ alignSelf: 'stretch' }}>
                            <i className="ti ti-plus" /> {adding ? '…' : 'Adicionar'}
                        </button>
                    </form>

                    {sources.length === 0 ? (
                        <div className="empty" style={{ padding: 22 }}><i className="ti ti-spider" />Nenhum recrutador cadastrado. O scraper usa o perfil padrão.</div>
                    ) : sources.map((s) => (
                        <div key={s.id} className="rank-row">
                            <i className="ti ti-brand-linkedin" style={{ fontSize: 18, color: s.active ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }} />
                            <div style={{ minWidth: 0, flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{s.label || 'Recrutador'}</div>
                                <a href={s.url} target="_blank" rel="noopener" className="muted"
                                    style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', textDecoration: 'underline' }}>{s.url}</a>
                            </div>
                            <span className={`badge ${s.active ? 'ok' : 'warn'}`}>{s.active ? 'ativo' : 'pausado'}</span>
                            <button className="btn ghost sm" title={s.active ? 'Pausar' : 'Ativar'} onClick={() => toggle(s)}>
                                <i className={`ti ${s.active ? 'ti-player-pause' : 'ti-player-play'}`} />
                            </button>
                            <button className="btn ghost sm" title="Remover" onClick={() => remove(s)}><i className="ti ti-trash" /></button>
                        </div>
                    ))}
                </div>

                {/* ---- Top usuários ---- */}
                <div className="card" style={{ flex: 1, minWidth: 300 }}>
                    <div className="section-title"><i className="ti ti-users" /> Top usuários (candidaturas)</div>
                    {(overview?.topUsers || []).length === 0 ? (
                        <div className="empty" style={{ padding: 22 }}><i className="ti ti-user-off" />Sem usuários ainda.</div>
                    ) : overview.topUsers.map((u, i) => (
                        <div key={u.email} className="rank-row">
                            <span className={`rank-pos ${i < 3 ? 'top' : ''}`}>{i + 1}</span>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                                <div className="muted" style={{ fontSize: 11.5 }}>{u.email} · plano {u.plan}</div>
                            </div>
                            <span className="rank-sent">{u.apps} envios</span>
                        </div>
                    ))}
                </div>
            </div>
            </>)}
        </div>
    );
}
