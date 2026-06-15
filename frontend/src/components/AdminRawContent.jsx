import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { fmtDate } from '../utils.js';

const FILTERS = [['', 'Todos'], ['pending', 'Pendentes'], ['approved', 'Aprovados'], ['rejected', 'Rejeitados']];
const STATUS_BADGE = { pending: 'warn', approved: 'ok', rejected: 'danger' };

export default function AdminRawContent() {
    const toast = useToast();
    const [posts, setPosts] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('');
    const [open, setOpen] = useState(null);
    const [busy, setBusy] = useState(null);
    const [bulking, setBulking] = useState('');
    const pageSize = 20;

    async function load(status = filter, p = page) {
        setLoading(true);
        try { const r = await api.adminRaw({ status, page: p }); setPosts(r.posts); setTotal(r.total); setPage(r.page); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setLoading(false); }
    }
    useEffect(() => { load('', 1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    function pick(status) { setFilter(status); load(status, 1); }

    async function bulk(action) {
        const target = filter || 'pending';
        const labels = { approve: 'aceitar todos', reject: 'recusar todos', reprocess: 'reprocessar todos pela IA' };
        if (!window.confirm(`${labels[action]} os "${target}" (até 500)?`)) return;
        setBulking(action);
        try {
            const r = await api.adminRawBulk(action, target);
            toast.show(`${labels[action]}: ${r.done}/${r.total} processados`);
            await load(filter, 1);
        } catch (e) { toast.show(e.message, 'error'); }
        finally { setBulking(''); }
    }

    async function setStatus(p, status) {
        try { await api.adminRawStatus(p.id, status); setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, status } : x))); }
        catch (e) { toast.show(e.message, 'error'); }
    }
    async function reprocess(p) {
        setBusy(p.id);
        try { const { ai } = await api.adminReprocess(p.id); setPosts((prev) => prev.map((x) => (x.id === p.id ? { ...x, ai } : x))); toast.show('Reprocessado pela IA'); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setBusy(null); }
    }

    return (
        <div className="card">
            <div className="row" style={{ alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div className="segmented">
                    {FILTERS.map(([v, l]) => <button key={v} className={filter === v ? 'active' : ''} onClick={() => pick(v)}>{l}</button>)}
                </div>
                <button className="btn ghost sm" onClick={() => load(filter, page)}><i className="ti ti-refresh" /></button>
                <div className="spacer" />
                <span className="muted" style={{ fontSize: 11.5 }}>em lote ({filter || 'pendentes'}):</span>
                <button className="btn ghost sm" disabled={!!bulking} onClick={() => bulk('reprocess')}><i className="ti ti-robot" /> {bulking === 'reprocess' ? '…' : 'Reprocessar IA'}</button>
                <button className="btn ghost sm" disabled={!!bulking} onClick={() => bulk('approve')}><i className="ti ti-checks" /> {bulking === 'approve' ? '…' : 'Aceitar todos'}</button>
                <button className="btn ghost sm" disabled={!!bulking} onClick={() => bulk('reject')}><i className="ti ti-x" /> {bulking === 'reject' ? '…' : 'Recusar todos'}</button>
            </div>

            {loading ? (
                <div><div className="skeleton sk-card" style={{ height: 70, marginBottom: 10 }} /><div className="skeleton sk-card" style={{ height: 70 }} /></div>
            ) : posts.length === 0 ? (
                <div className="empty" style={{ padding: 30 }}><i className="ti ti-inbox-off" />Nada aqui.</div>
            ) : posts.map((p) => {
                const ai = p.ai || {};
                const expanded = open === p.id;
                return (
                    <div key={p.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
                        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                            <i className="ti ti-brand-linkedin" style={{ color: 'var(--color-accent)', fontSize: 18 }} />
                            <strong style={{ fontSize: 13 }}>{p.author || 'Autor desconhecido'}</strong>
                            <span className={`badge ${STATUS_BADGE[p.status] || 'neutral'}`}>{p.status}</span>
                            <span className="muted" style={{ fontSize: 11.5 }}>{fmtDate(p.createdAt)}</span>
                            <div className="spacer" />
                            {p.ai && (
                                <span className={`badge ${ai.isJob ? 'ok' : 'neutral'}`} title="classificação IA">
                                    {ai.isJob ? 'vaga' : ai.isAd ? 'propaganda' : ai.isGeneric ? 'genérico' : ai.isRecruiter ? 'recrutador' : '—'} {ai.confidence != null ? `· ${ai.confidence}%` : ''}
                                </span>
                            )}
                        </div>
                        {p.ai && (ai.cargo || ai.empresa) && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                                {ai.cargo || '—'}{ai.empresa ? ` · ${ai.empresa}` : ''}{ai.email ? ` · ${ai.email}` : ''}
                                {ai.tecnologias?.length ? ` · ${ai.tecnologias.slice(0, 6).join(', ')}` : ''}
                            </div>
                        )}
                        <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap', maxHeight: expanded ? 'none' : 60, overflow: 'hidden' }}>
                            {p.content || '(sem texto)'}
                        </div>
                        <div className="row" style={{ gap: 8, marginTop: 10, alignItems: 'center' }}>
                            <button className="btn ghost sm" onClick={() => setOpen(expanded ? null : p.id)}>{expanded ? 'menos' : 'ver tudo'}</button>
                            {p.url && <a className="btn ghost sm" href={p.url} target="_blank" rel="noopener"><i className="ti ti-external-link" /> post</a>}
                            <div className="spacer" />
                            <button className="btn ghost sm" disabled={busy === p.id} onClick={() => reprocess(p)} title="Reprocessar IA"><i className="ti ti-robot" /> {busy === p.id ? '…' : 'IA'}</button>
                            {p.status !== 'approved' && <button className="btn ghost sm" onClick={() => setStatus(p, 'approved')} title="Aprovar"><i className="ti ti-check" /></button>}
                            {p.status !== 'rejected' && <button className="btn ghost sm" onClick={() => setStatus(p, 'rejected')} title="Rejeitar"><i className="ti ti-x" /></button>}
                        </div>
                    </div>
                );
            })}

            {!loading && total > pageSize && (
                <div className="row" style={{ alignItems: 'center', marginTop: 12 }}>
                    <span className="muted" style={{ fontSize: 12 }}>{total} post(s) · página {page}/{Math.ceil(total / pageSize)}</span>
                    <div className="spacer" />
                    <button className="btn ghost sm" disabled={page <= 1} onClick={() => load(filter, page - 1)}><i className="ti ti-chevron-left" /> anterior</button>
                    <button className="btn ghost sm" disabled={page >= Math.ceil(total / pageSize)} onClick={() => load(filter, page + 1)}>próxima <i className="ti ti-chevron-right" /></button>
                </div>
            )}
        </div>
    );
}
