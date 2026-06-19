import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from './Toast.jsx';
import { scoreClass } from '../utils.js';

export default function SearchSendModal({ onClose, onStarted }) {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const [phase, setPhase] = useState('searching'); // searching | choose | manual
    const [matches, setMatches] = useState([]);
    const [filtered, setFiltered] = useState(0); // vagas escondidas pelos filtros do perfil
    const [selected, setSelected] = useState(new Set());
    const [expanded, setExpanded] = useState(null);
    const [starting, setStarting] = useState(false);

    const ready = user.googleConnected && user.hasProfile && user.hasCv;
    const isFree = (user.plan || 'free') === 'free';

    useEffect(() => {
        let alive = true;
        const started = Date.now();
        (async () => {
            try { await refreshUser(); } catch { /* ignore */ }
            let list = []; let hidden = 0;
            try { const r = await api.getMatches(); list = r.matches; hidden = r.filtered || 0; } catch { /* ignore */ }
            // Mínimo curto só para a animação de "busca" não piscar — sem padding
            // artificial de tempo. Se a API já demorou mais que isso, abre na hora.
            const wait = Math.max(0, 700 - (Date.now() - started));
            setTimeout(() => { if (alive) { setMatches(list); setFiltered(hidden); setSelected(new Set(list.map((m) => m.id))); setPhase('choose'); } }, wait);
        })();
        return () => { alive = false; };
    }, []);

    async function start(mode, jobIds) {
        setStarting(true);
        try {
            await api.queueStart(mode, jobIds);
            toast.show(mode === 'auto' ? 'Envio automático iniciado!' : `${jobIds.length} vaga(s) na fila de envio`);
            onStarted?.();
            onClose();
        } catch (e) {
            if (e.status === 402) toast.show('Seleção manual é um recurso dos planos pagos.', 'error');
            else toast.show(e.message, 'error');
            setStarting(false);
        }
    }

    function toggle(id) {
        setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
    }

    return (
        <div className="modal-overlay" onClick={() => !starting && onClose()}>
            <div className="modal" style={{ maxWidth: phase === 'manual' ? 680 : 560 }} onClick={(e) => e.stopPropagation()}>

                {phase === 'searching' && (
                    <div style={{ padding: '48px 32px', textAlign: 'center' }}>
                        <div className="search-pulse"><i className="ti ti-radar-2" /></div>
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginTop: 18 }}>Buscando vagas disponíveis</h3>
                        <p className="muted" style={{ marginTop: 8 }}>Analisando oportunidades no banco de dados…</p>
                        <p className="muted" style={{ marginTop: 4, fontSize: 12.5 }}>Analisamos milhares de vagas em tempo real no nosso banco de dados!</p>
                    </div>
                )}

                {phase === 'choose' && (
                    <>
                        <div className="modal-head">
                            <i className="ti ti-sparkles" style={{ color: 'var(--color-accent)', fontSize: 20 }} />
                            <h3>Como deseja enviar os e-mails?</h3>
                            <button className="close" onClick={onClose}><i className="ti ti-x" /></button>
                        </div>
                        <div style={{ padding: '18px 22px' }}>
                            {matches.length === 0 ? (
                                filtered > 0 ? (
                                    <div className="notice warn">
                                        <i className="ti ti-filter-x" />
                                        <span><b>{filtered}</b> vaga(s) encontrada(s), mas todas foram descartadas pelos seus filtros (ex.: keyword obrigatória). Ajuste em <Link to="/app/perfil?section=filters">Perfil → Filtros</Link>.</span>
                                    </div>
                                ) : (
                                    <div className="empty"><i className="ti ti-briefcase-off" />Nenhuma vaga disponível agora. Rode o scraper ou volte mais tarde.</div>
                                )
                            ) : !ready ? (
                                <div className="notice warn">
                                    <i className="ti ti-alert-triangle" />
                                    <span>Para enviar, conclua sua configuração (conta Google + currículo) no <Link to="/app/perfil">seu perfil</Link>.</span>
                                </div>
                            ) : (
                                <>
                                    <p style={{ marginBottom: 16 }}>
                                        Sistema encontrou <b style={{ color: 'var(--color-accent)' }}>{matches.length} matches</b> perfeitos!
                                        Executo o envio em lote ou prefere modo seleção manual?
                                    </p>
                                    <div className="choice" onClick={() => !starting && start('auto')}>
                                        <div className="choice-ico ok"><i className="ti ti-bolt" /></div>
                                        <div>
                                            <div className="choice-t">Enviar automaticamente</div>
                                            <div className="choice-d">Enviar todas as {matches.length} vagas filtradas (uma a cada 60–120s).</div>
                                        </div>
                                        <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }} />
                                    </div>
                                    <div className={`choice ${isFree ? 'locked' : ''}`}
                                        onClick={() => { if (isFree) toast.show('Seleção manual disponível nos planos pagos.', 'error'); else setPhase('manual'); }}>
                                        <div className="choice-ico"><i className={`ti ${isFree ? 'ti-lock' : 'ti-list-check'}`} /></div>
                                        <div>
                                            <div className="choice-t">Revise antes de enviar {isFree && <span className="badge warn">Pro</span>}</div>
                                            <div className="choice-d">Revisar e selecionar vagas específicas para envio.</div>
                                        </div>
                                        <i className="ti ti-chevron-right" style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }} />
                                    </div>
                                    {isFree && <p className="muted" style={{ fontSize: 12, marginTop: 12, textAlign: 'center' }}>No plano free o envio é automático. Faça upgrade para revisar manualmente.</p>}
                                </>
                            )}
                        </div>
                    </>
                )}

                {phase === 'manual' && (
                    <>
                        <div className="modal-head">
                            <button className="btn ghost sm" onClick={() => setPhase('choose')}><i className="ti ti-arrow-left" /></button>
                            <h3>Selecionar vagas ({selected.size}/{matches.length})</h3>
                            <button className="close" onClick={onClose}><i className="ti ti-x" /></button>
                        </div>
                        <div className="modal-body" style={{ padding: '8px 16px' }}>
                            <label className="row" style={{ alignItems: 'center', gap: 8, padding: '8px 4px', cursor: 'pointer' }}>
                                <input type="checkbox" checked={selected.size === matches.length}
                                    onChange={(e) => setSelected(e.target.checked ? new Set(matches.map((m) => m.id)) : new Set())} />
                                Selecionar todas
                            </label>
                            {matches.map((m) => (
                                <div key={m.id} className="sel-item">
                                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{m.title || 'Vaga'}</div>
                                        <div className="muted" style={{ fontSize: 12 }}>{m.company || '—'} · {m.matchScore}% match</div>
                                        {expanded === m.id && <div className="muted" style={{ fontSize: 12, marginTop: 6, whiteSpace: 'pre-wrap', maxHeight: 160, overflow: 'auto' }}>{m.description || 'Sem descrição.'}</div>}
                                        <button className="btn ghost sm" style={{ padding: '2px 0', marginTop: 4 }} onClick={() => setExpanded(expanded === m.id ? null : m.id)}>
                                            <i className={`ti ti-chevron-${expanded === m.id ? 'up' : 'down'}`} /> {expanded === m.id ? 'ocultar' : 'ver detalhes'}
                                        </button>
                                    </div>
                                    <span className={`score ${scoreClass(m.matchScore)}`}>{m.matchScore}%</span>
                                </div>
                            ))}
                        </div>
                        <div className="modal-foot">
                            <button className="btn ghost" onClick={onClose}>Cancelar</button>
                            <button className="btn primary" disabled={starting || selected.size === 0}
                                onClick={() => start('manual', [...selected])}>
                                {starting ? 'Enviando…' : (<><i className="ti ti-send" /> Adicionar {selected.size} à fila</>)}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
