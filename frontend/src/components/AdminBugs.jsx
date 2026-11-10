import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// Relatos de "Relatar problema". Até 10/11/2026 eles eram gravados e nenhuma tela
// mostrava: um relato real ficou sem ninguém ver.
const STATUS = {
    new: { label: 'Novo', cls: 'warn' },
    triaged: { label: 'Em análise', cls: 'info' },
    resolved: { label: 'Resolvido', cls: 'ok' },
    wontfix: { label: 'Não vou fazer', cls: 'neutral' },
};
const FILTROS = [['new', 'Novos'], ['triaged', 'Em análise'], ['', 'Todos']];

export default function AdminBugs() {
    const toast = useToast();
    const [filtro, setFiltro] = useState('new');
    const [relatos, setRelatos] = useState(null);
    const [ocupado, setOcupado] = useState(null);

    async function carregar(status = filtro) {
        setRelatos(null);
        try {
            const { reports } = await api.adminBugs(status);
            setRelatos(reports);
        } catch (e) { toast.show(e.message, 'error'); setRelatos([]); }
    }
    useEffect(() => { carregar(filtro); }, [filtro]);

    async function mudar(r, status) {
        setOcupado(r.id);
        try {
            await api.adminBugUpdate(r.id, { status });
            setRelatos((l) => (filtro && filtro !== status ? l.filter((x) => x.id !== r.id) : l.map((x) => (x.id === r.id ? { ...x, status } : x))));
        } catch (e) { toast.show(e.message, 'error'); } finally { setOcupado(null); }
    }

    return (
        <div>
            <p className="muted" style={{ marginTop: 0 }}>O que as pessoas mandaram em "Relatar problema", com a página e o erro do navegador.</p>
            <div className="chips" style={{ marginBottom: 14 }}>
                {FILTROS.map(([v, l]) => (
                    <span key={l} className={`chip toggle ${filtro === v ? 'on' : ''}`} onClick={() => setFiltro(v)}>{l}</span>
                ))}
            </div>
            {relatos === null ? (
                <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '60%' }} /></div>
            ) : relatos.length === 0 ? (
                <div className="card empty" style={{ padding: 28 }}><i className="ti ti-mood-happy" /><div>Nenhum relato aqui.</div></div>
            ) : (
                <div className="card lista-card">
                    {relatos.map((r) => {
                        const st = STATUS[r.status] || STATUS.new;
                        return (
                            <div key={r.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border-light)' }}>
                                <div className="row" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span className={`badge ${st.cls}`}>{st.label}</span>
                                    <b>{r.user?.name || 'Sem nome'}</b>
                                    <span className="muted" style={{ fontSize: 12.5 }}>{r.user?.email} · {haQuanto(r.createdAt)}</span>
                                </div>
                                <div style={{ whiteSpace: 'pre-wrap', margin: '10px 0', lineHeight: 1.55 }}>{r.message}</div>
                                <div className="muted" style={{ fontSize: 12 }}>
                                    {[r.page && `página ${r.page}`, r.viewport && `tela ${r.viewport}`].filter(Boolean).join(' · ')}
                                </div>
                                {r.appError && <div className="muted mono" style={{ fontSize: 12, marginTop: 6, overflowWrap: 'anywhere' }}>erro: {r.appError}</div>}
                                <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                                    {Object.entries(STATUS).filter(([k]) => k !== r.status && k !== 'new').map(([k, s]) => (
                                        <button key={k} className="btn ghost sm" disabled={ocupado === r.id} onClick={() => mudar(r, k)}>{s.label}</button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
