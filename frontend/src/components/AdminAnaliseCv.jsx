import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// Admin › Currículo IA: a análise e reescrita do currículo (services/analiseCv.js).
// Responde primeiro "está ligada, quem usa e quanto gasta?" e depois dá os
// controles: chave geral, limite por pessoa, bloquear e dar análises a mais.
const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const segundos = (ms) => (ms == null ? '' : `${(ms / 1000).toFixed(1).replace('.', ',')} s`);

export default function AdminAnaliseCv() {
    const toast = useToast();
    const [d, setD] = useState(null);
    const [limite, setLimite] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [aberta, setAberta] = useState(null);
    const [email, setEmail] = useState('');
    const [extras, setExtras] = useState('3');
    const [motivo, setMotivo] = useState('');
    const trava = useRef(false);

    async function carregar() {
        try {
            const r = await api.adminAnaliseCv();
            setD(r);
            setLimite(String(r.controle.limite));
        } catch (e) { toast.show(e.message, 'error'); setD({ erro: true }); }
    }
    useEffect(() => { carregar(); }, []);

    async function acao(fn, ok) {
        if (trava.current) return;
        trava.current = true;
        setOcupado(true);
        try {
            await fn();
            if (ok) toast.show(ok, 'success');
            await carregar();
        } catch (e) { toast.show(e.message, 'error'); } finally { setOcupado(false); trava.current = false; }
    }

    const mudarChave = (ativa) => {
        if (!ativa && !window.confirm('Desligar a análise de currículo para todo mundo? Ela some do perfil de todos (menos o seu, de admin).')) return;
        acao(() => api.adminAnaliseCvControle({ ativa }), ativa ? 'Análise ligada para todos.' : 'Análise desligada.');
    };
    const salvarLimite = () => acao(() => api.adminAnaliseCvControle({ limite: Number(limite) }), 'Limite salvo.');
    const ajustar = (ajuste, ok) => acao(() => api.adminAnaliseCvPessoa(ajuste), ok);

    function porEmail(bloquear) {
        const alvo = email.trim();
        if (!alvo) return;
        const ajuste = bloquear
            ? { email: alvo, bloqueado: true, motivo: motivo.trim() || null }
            : { email: alvo, extras: Number(extras) || 0, motivo: motivo.trim() || undefined };
        ajustar(ajuste, bloquear ? 'Pessoa bloqueada.' : 'Análises extras salvas.');
        setEmail(''); setMotivo('');
    }

    async function abrir(id) {
        try { setAberta(await api.adminAnaliseCvDetalhe(id)); } catch (e) { toast.show(e.message, 'error'); }
    }

    if (!d) return <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '60%' }} /></div>;
    if (d.erro) return <div className="card empty" style={{ padding: 28 }}><i className="ti ti-alert-triangle" /><div>Não deu para carregar.</div></div>;

    const n = d.numeros || {};
    const semMigration = d.disponivel && (!d.migration.settings || !d.migration.ajustes);
    const tokensPorAnalise = n.comTokens ? Math.round((n.tokensIn + n.tokensOut) / n.comTokens) : null;

    return (
        <div>
            <p className="muted" style={{ marginTop: 0 }}>Melhorar meu currículo: está ligada, quem usa e quanto gasta? Modelo <b>{d.modelo}</b>.</p>

            {!d.openaiConfigurada && (
                <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: 'var(--color-danger)' }}>
                    <i className="ti ti-alert-triangle" /> A chave da OpenAI não está configurada no servidor: a ferramenta não aparece para ninguém.
                </div>
            )}
            {d.openaiConfigurada && !d.disponivel && (
                <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                    <i className="ti ti-alert-triangle" /> A tabela <code>CvAnalyses</code> não existe: falta a migration 0024.
                </div>
            )}
            {semMigration && (
                <div className="card" style={{ padding: 14, marginBottom: 14 }}>
                    <i className="ti ti-alert-triangle" /> Falta aplicar a migration <code>0025_controle_analise_cv.sql</code>: os números aparecem, mas desligar, mudar o limite e bloquear só funcionam depois dela.
                </div>
            )}

            {/* ---- Chave geral e limite ---- */}
            <div className="card" style={{ padding: 18, marginBottom: 16 }}>
                <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={`badge ${d.controle.ativa ? 'ok' : 'warn'}`}>{d.controle.ativa ? 'Ligada para todos' : 'Desligada'}</span>
                    <span className="muted" style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
                        {d.controle.ativa
                            ? 'Aparece em Meu perfil para quem tem currículo anexado.'
                            : 'Sumiu do perfil de todos. Você, como admin, continua usando para testar.'}
                    </span>
                    {d.controle.ativa
                        ? <button className="btn danger sm" disabled={ocupado || semMigration} onClick={() => mudarChave(false)}><i className="ti ti-power" /> Desligar para todos</button>
                        : <button className="btn primary sm" disabled={ocupado || semMigration} onClick={() => mudarChave(true)}><i className="ti ti-power" /> Ligar</button>}
                </div>
                <div className="row" style={{ alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13 }}>Análises por pessoa:</span>
                    <input className="input" type="number" min={0} max={d.limiteMaximo} value={limite}
                        onChange={(e) => setLimite(e.target.value)} style={{ width: 80 }} />
                    <button className="btn ghost sm" disabled={ocupado || semMigration || Number(limite) === d.controle.limite || limite === ''}
                        onClick={salvarLimite}>Salvar limite</button>
                    <span className="muted" style={{ fontSize: 12.5 }}>Vale para todos, somado às extras de cada um. Zero = ninguém analisa mais (quem já analisou continua vendo a última).</span>
                </div>
            </div>

            {/* ---- Números ---- */}
            <div className="stats-grid">
                {[
                    { l: 'análises no total', v: nf(n.total), i: 'ti-file-cv' },
                    { l: 'últimas 24 h', v: nf(n.ultimas24h), i: 'ti-clock' },
                    { l: 'últimos 7 dias', v: nf(n.ultimos7d), i: 'ti-calendar' },
                    { l: 'pessoas que usaram', v: nf(n.pessoas), i: 'ti-users' },
                    { l: 'chegaram no limite', v: nf(n.chegaramNoLimite), i: 'ti-lock' },
                    { l: 'nota média dada', v: n.scoreMedio ?? '', i: 'ti-star' },
                    { l: 'tokens por análise', v: tokensPorAnalise ? nf(tokensPorAnalise) : '', i: 'ti-coins', sub: n.comTokens ? `${nf(n.tokensIn)} entrada · ${nf(n.tokensOut)} saída` : 'conta desde a migration 0025' },
                    { l: 'tempo médio', v: segundos(n.duracaoMediaMs), i: 'ti-hourglass' },
                ].map((c) => (
                    <div key={c.l} className="card stat" style={{ padding: 16 }}>
                        <div className="stat-l"><i className={`ti ${c.i}`} /> {c.l}</div>
                        <div className="stat-n" style={{ fontSize: 24 }}>{c.v}</div>
                        {c.sub && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>{c.sub}</div>}
                    </div>
                ))}
            </div>

            {/* ---- Falhas ---- */}
            <div className="card" style={{ padding: 18, marginBottom: 16 }}>
                <div className="section-title"><i className="ti ti-alert-triangle" /> Falhas desde o último deploy ({haQuanto(d.bootEm)}): {nf(d.falhasDesdeBoot)}</div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>
                    Falha não gasta uso da pessoa e não fica no banco: a lista recomeça a cada deploy.
                    {d.emAndamento ? ` ${d.emAndamento} análise(s) rodando agora.` : ''}
                </p>
                {d.falhas.length === 0
                    ? <div className="muted" style={{ fontSize: 13 }}>Nenhuma.</div>
                    : d.falhas.map((f, i) => (
                        <div key={i} style={{ fontSize: 13, padding: '6px 0', borderTop: i ? '1px solid var(--color-border-light)' : 'none' }}>
                            <span className="badge warn">{f.status}</span> <span className="muted">{haQuanto(f.em)}</span> {f.motivo}
                        </div>
                    ))}
            </div>

            {/* ---- Bloquear ou dar análises por email ---- */}
            <div className="card" style={{ padding: 18, marginBottom: 16 }}>
                <div className="section-title"><i className="ti ti-user-cog" /> Bloquear ou dar análises a alguém</div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>Funciona para quem ainda não usou. Bloqueada, a ferramenta some do perfil daquela pessoa.</p>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <input className="input" style={{ flex: 2, minWidth: 220 }} placeholder="email da conta" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <input className="input" style={{ width: 90 }} type="number" min={0} max={d.extrasMaximo} title="Análises extras" value={extras} onChange={(e) => setExtras(e.target.value)} />
                    <input className="input" style={{ flex: 2, minWidth: 180 }} placeholder="motivo (opcional, só você vê)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                    <button className="btn ghost sm" disabled={ocupado || semMigration || !email.trim()} onClick={() => porEmail(false)}><i className="ti ti-plus" /> Definir extras</button>
                    <button className="btn danger sm" disabled={ocupado || semMigration || !email.trim()} onClick={() => porEmail(true)}><i className="ti ti-ban" /> Bloquear</button>
                </div>
            </div>

            {/* ---- Pessoas ---- */}
            <div className="section-title" style={{ marginTop: 8 }}><i className="ti ti-users" /> Quem usou ({nf(d.pessoas.length)})</div>
            {d.pessoas.length === 0 ? (
                <div className="card empty" style={{ padding: 24, marginBottom: 16 }}><i className="ti ti-file-cv" /><div>Ninguém usou ainda.</div></div>
            ) : (
                <div className="card lista-card" style={{ marginBottom: 16 }}>
                    {d.pessoas.map((p) => (
                        <div key={p.userId} className="row" style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border-light)', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <b>{p.nome || 'Sem nome'}</b> <span className="muted" style={{ fontSize: 12.5 }}>{p.email}</span>
                                <div className="muted" style={{ fontSize: 12.5 }}>
                                    {p.usadas} usada(s){p.extras ? `, ${p.extras} extra(s)` : ''}, {p.bloqueado ? 'bloqueada' : `${p.restantes} restante(s)`}
                                    {p.ultima ? ` · última ${haQuanto(p.ultima)}` : ''}
                                    {p.motivo ? ` · ${p.motivo}` : ''}
                                </div>
                            </div>
                            {p.bloqueado && <span className="badge warn">Bloqueada</span>}
                            <button className="btn ghost sm" disabled={ocupado || semMigration} title="Dar mais uma análise"
                                onClick={() => ajustar({ userId: p.userId, extras: Math.min(d.extrasMaximo, p.extras + 1) }, 'Mais uma análise liberada.')}><i className="ti ti-plus" /> 1</button>
                            {p.bloqueado
                                ? <button className="btn ghost sm" disabled={ocupado || semMigration} onClick={() => ajustar({ userId: p.userId, bloqueado: false }, 'Desbloqueada.')}><i className="ti ti-lock-open" /> Desbloquear</button>
                                : <button className="btn danger sm" disabled={ocupado || semMigration} onClick={() => ajustar({ userId: p.userId, bloqueado: true }, 'Bloqueada.')}><i className="ti ti-ban" /> Bloquear</button>}
                        </div>
                    ))}
                </div>
            )}

            {/* ---- Últimas análises ---- */}
            <div className="section-title"><i className="ti ti-list" /> Últimas análises</div>
            {d.analises.length === 0 ? (
                <div className="card empty" style={{ padding: 24 }}><i className="ti ti-file-cv" /><div>Nenhuma análise ainda.</div></div>
            ) : (
                <div className="card lista-card">
                    {d.analises.map((a) => (
                        <div key={a.id} className="row" style={{ padding: '10px 18px', borderBottom: '1px solid var(--color-border-light)', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <b>{a.nome || a.email}</b>
                                <div className="muted" style={{ fontSize: 12.5 }}>
                                    {haQuanto(a.criadaEm)}{a.tokensIn != null ? ` · ${nf(a.tokensIn + (a.tokensOut || 0))} tokens` : ''}{a.duracaoMs ? ` · ${segundos(a.duracaoMs)}` : ''}{a.modelo ? ` · ${a.modelo}` : ''}
                                </div>
                            </div>
                            {a.score != null && <span className="badge info">nota {a.score}</span>}
                            <button className="btn ghost sm" onClick={() => abrir(a.id)}><i className="ti ti-eye" /> Ver</button>
                        </div>
                    ))}
                </div>
            )}

            {aberta && <DetalheAnalise a={aberta} fechar={() => setAberta(null)} />}
        </div>
    );
}

function Lista({ titulo, itens }) {
    if (!itens?.length) return null;
    return (
        <div className="det-secao">
            <span className="det-rotulo">{titulo}</span>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, lineHeight: 1.55 }}>{itens.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
    );
}

function DetalheAnalise({ a, fechar }) {
    const cv = a.curriculo || {};
    return (
        <div className="modal-overlay" onClick={fechar}>
            <div className="modal det" onClick={(e) => e.stopPropagation()}>
                <div className="det-topo">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3>{a.nome || a.email}{a.score != null ? `: nota ${a.score}` : ''}</h3>
                        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{a.email} · {haQuanto(a.criadaEm)} · {a.modelo}</div>
                    </div>
                    <button className="close" onClick={fechar} aria-label="Fechar"><i className="ti ti-x" /></button>
                </div>
                <div className="modal-body">
                    {a.resumoExecutivo && <div className="det-secao"><span className="det-rotulo">Resumo</span><div>{a.resumoExecutivo}</div></div>}
                    {a.comparacaoMercado && <div className="det-secao"><span className="det-rotulo">Comparação com o mercado</span><div>{a.comparacaoMercado}</div></div>}
                    <Lista titulo="Pontos fortes" itens={a.pontosFortes} />
                    <Lista titulo="Pontos fracos" itens={a.pontosFracos} />
                    <Lista titulo="Dicas" itens={a.dicas} />
                    {a.palavrasChave?.length > 0 && (
                        <div className="det-secao">
                            <span className="det-rotulo">Palavras-chave (verde = já está no currículo)</span>
                            <div className="chips" style={{ marginTop: 6 }}>
                                {a.palavrasChave.map((p) => <span key={p.palavra} className={`chip ${p.temNoCurriculo ? 'toggle on' : ''}`}>{p.palavra}</span>)}
                            </div>
                        </div>
                    )}
                    <div className="det-secao">
                        <span className="det-rotulo">Currículo reescrito</span>
                        <div style={{ lineHeight: 1.55 }}>
                            <b>{cv.nome}</b>{cv.titulo ? `, ${cv.titulo}` : ''}
                            {cv.resumoProfissional && <p style={{ margin: '6px 0' }}>{cv.resumoProfissional}</p>}
                            {(cv.experiencias || []).map((e, i) => (
                                <div key={i} style={{ marginTop: 8 }}>
                                    <b>{e.cargo}</b>{e.empresa ? `, ${e.empresa}` : ''} <span className="muted">{e.periodo}</span>
                                    <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{(e.atividades || []).map((x, j) => <li key={j}>{x}</li>)}</ul>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="modal-foot"><button className="btn ghost sm" onClick={fechar}>Fechar</button></div>
                </div>
            </div>
        </div>
    );
}
