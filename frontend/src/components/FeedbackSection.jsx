import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useToast } from './Toast.jsx';
import { fmtDate } from '../utils.js';

function Stars({ value = 0, onChange, size }) {
    return (
        <span className={`stars ${onChange ? 'input' : ''}`} style={size ? { fontSize: size } : undefined}>
            {[1, 2, 3, 4, 5].map((n) => (
                <i key={n} className={`ti ti-star-filled ${n <= value ? 'on' : ''}`}
                    onClick={onChange ? () => onChange(n === value ? 0 : n) : undefined} />
            ))}
        </span>
    );
}

// Mensagem recolhível (trunca textos longos)
function Msg({ text, limit = 160 }) {
    const [open, setOpen] = useState(false);
    const long = text.length > limit;
    return (
        <div className="fb-msg">
            {long && !open ? text.slice(0, limit).trimEnd() + '… ' : text}
            {long && (
                <button type="button" className="fb-more" onClick={() => setOpen((v) => !v)}>
                    {open ? 'ver menos' : 'ver mais'}
                </button>
            )}
        </div>
    );
}

export default function FeedbackSection({ limit = 0, compact = false, title = true }) {
    const toast = useToast();
    // Cacheado por limite: o bloco do Dashboard (limit=5) e a página (limit=0)
    // não refazem a chamada quando o usuário navega entre eles.
    const { data, loading, refresh } = useCachedResource(`feedback:${limit}`, () => api.getFeedback(limit));
    const items = data?.feedback || [];
    const summary = data?.summary || { rated: 0, average: 0, distribution: {}, count: 0 };
    const mine = data?.mine || null;

    const [message, setMessage] = useState('');
    const [rating, setRating] = useState(0);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(false);

    // Preenche o editor a partir da avaliação existente — mas não enquanto o
    // usuário edita, para uma revalidação em segundo plano não apagar o texto.
    useEffect(() => {
        if (editing) return;
        setMessage(mine?.message || '');
        setRating(mine?.rating || 0);
    }, [mine?.id, mine?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

    const load = refresh;

    async function submit(e) {
        e.preventDefault();
        if (!message.trim()) return;
        setBusy(true);
        try {
            await api.postFeedback({ message, rating: rating || undefined });
            await load();
            setEditing(false);
            toast.show(mine ? 'Avaliação atualizada' : 'Obrigado pelo seu relato!');
        } catch (err) { toast.show(err.message, 'error'); }
        finally { setBusy(false); }
    }

    async function remove() {
        if (!mine || !window.confirm('Apagar sua avaliação?')) return;
        try {
            await api.deleteFeedback(mine.id);
            setMessage(''); setRating(0); setEditing(false);
            await load();
            toast.show('Avaliação apagada');
        } catch (err) { toast.show(err.message, 'error'); }
    }

    const others = items.filter((f) => !f.mine);
    const list = compact ? items : others;
    const maxDist = Math.max(1, ...Object.values(summary.distribution || {}));

    return (
        <div className="card">
            {title && <div className="section-title"><i className="ti ti-message-2" /> Feedback da comunidade</div>}

            {summary.rated > 0 && (
                <div className="fb-summary">
                    <div className="fb-avg">
                        <div className="num">{summary.average.toFixed(1)}</div>
                        <Stars value={Math.round(summary.average)} />
                        <div className="cnt">{summary.rated} avaliaç{summary.rated === 1 ? 'ão' : 'ões'}</div>
                    </div>
                    <div className="fb-dist">
                        {[5, 4, 3, 2, 1].map((star) => {
                            const c = summary.distribution[star] || 0;
                            return (
                                <div key={star} className="fb-dist-row">
                                    <span className="lbl">{star}<i className="ti ti-star-filled" /></span>
                                    <span className="fb-bar"><span style={{ width: `${(c / maxDist) * 100}%` }} /></span>
                                    <span className="cnt">{c}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Sua avaliação (cria ou edita) — oculto no modo compacto */}
            {compact || loading ? null : (mine && !editing) ? (
                <div className="fb-editor">
                    <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
                        <strong style={{ fontSize: 13 }}>Sua avaliação</strong>
                        {mine.rating ? <Stars value={mine.rating} /> : null}
                        <div className="spacer" />
                        <button className="btn ghost sm" onClick={() => setEditing(true)}><i className="ti ti-pencil" /> Editar</button>
                        <button className="btn ghost sm" onClick={remove}><i className="ti ti-trash" /></button>
                    </div>
                    <Msg text={mine.message} />
                </div>
            ) : (
                <form onSubmit={submit} className="fb-editor">
                    <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 10 }}>{mine ? 'Editar sua avaliação' : 'Deixe seu relato'}</div>
                    <div style={{ marginBottom: 10 }}><Stars value={rating} onChange={setRating} /></div>
                    <textarea className="input" rows={3} value={message} maxLength={1000}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Como foi sua experiência com a plataforma?" style={{ resize: 'vertical' }} />
                    <div className="row" style={{ alignItems: 'center', marginTop: 10 }}>
                        <span className="muted" style={{ fontSize: 11.5 }}>{message.length}/1000</span>
                        <div className="spacer" />
                        {mine && <button type="button" className="btn ghost sm" onClick={() => { setEditing(false); setMessage(mine.message); setRating(mine.rating || 0); }}>Cancelar</button>}
                        <button className="btn primary sm" disabled={busy || !message.trim()}>
                            {busy ? 'Enviando…' : (<><i className="ti ti-send" /> {mine ? 'Salvar' : 'Enviar relato'}</>)}
                        </button>
                    </div>
                </form>
            )}

            {/* Relatos da comunidade */}
            {loading ? (
                <div style={{ paddingTop: 8 }}>
                    {[0, 1, 2].map((i) => (
                        <div key={i} style={{ marginBottom: 14 }}>
                            <div className="skeleton sk-line" style={{ width: '40%' }} />
                            <div className="skeleton sk-line" style={{ width: '90%' }} />
                        </div>
                    ))}
                </div>
            ) : list.length === 0 ? (
                <div className="empty" style={{ padding: 24 }}>
                    <i className="ti ti-message-heart" />
                    {mine ? 'Você é o primeiro a avaliar. Obrigado!' : 'Seja o primeiro a deixar um relato.'}
                </div>
            ) : (
                <div>
                    {list.map((f) => (
                        <div key={f.id} className="fb-item">
                            <div className="fb-head">
                                <div className="avatar" style={{ width: 28, height: 28, fontSize: 12 }}>
                                    {(f.author || '?').slice(0, 1).toUpperCase()}
                                </div>
                                <strong style={{ fontSize: 13 }}>{f.author}</strong>
                                {f.mine && <span className="badge ok" style={{ fontSize: 10 }}>você</span>}
                                {f.rating ? <Stars value={f.rating} /> : null}
                                <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>
                                    {fmtDate(f.createdAt)}{f.updatedAt ? ' · editado' : ''}
                                </span>
                            </div>
                            <Msg text={f.message} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
