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
    const mudarVersoes = (versoesAtivas) => {
        if (!versoesAtivas && !window.confirm('Desligar "Um currículo por tipo de vaga" para todo mundo? A aba some (menos para você) e os envios voltam a levar o currículo do perfil.')) return;
        acao(() => api.adminAnaliseCvControle({ versoesAtivas }), versoesAtivas ? 'Versões e envio com IA ligados.' : 'Versões e envio com IA desligados.');
    };
    const ajustar = (ajuste, ok) => acao(() => api.adminAnaliseCvPessoa(ajuste), ok);

    // modo: 'bloquear' | 'desbloquear' | 'extras'
    function porEmail(modo) {
        const alvo = email.trim();
        if (!alvo) return;
        if (modo === 'liberar') {
            acao(() => api.adminLiberarIa(alvo, 30), 'IA liberada por 30 dias (10 usos).');
            setEmail(''); setMotivo('');
            return;
        }
        const ajuste = modo === 'bloquear' ? { email: alvo, bloqueado: true, motivo: motivo.trim() || null }
            : modo === 'desbloquear' ? { email: alvo, bloqueado: false }
                : { email: alvo, extras: Number(extras) || 0, motivo: motivo.trim() || undefined };
        ajustar(ajuste, modo === 'bloquear' ? 'Pessoa bloqueada.' : modo === 'desbloquear' ? 'Pessoa desbloqueada.' : 'Análises extras salvas.');
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
            <p className="muted" style={{ marginTop: 0 }}>A seção <b>Currículo IA</b> tem duas abas, cada uma com a sua chave. Modelo <b>{d.modelo}</b>.</p>

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

            {/* ---- Aba 1: análise ---- */}
            <div className="card" style={{ padding: 18, marginBottom: 16 }}>
                <div className="section-title" style={{ marginBottom: 10 }}><i className="ti ti-report-search" /> Aba "Analisar meu currículo" (grátis)</div>
                <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={`badge ${d.controle.ativa ? 'ok' : 'warn'}`}>{d.controle.ativa ? 'Ligada para todos' : 'Desligada'}</span>
                    <span className="muted" style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
                        {d.controle.ativa
                            ? 'Todo mundo com currículo anexado vê a aba: no teste de 48 h ou com a IA liberada.'
                            : 'A aba sumiu para todos. Você, como admin, continua usando para testar.'}
                    </span>
                    {d.controle.ativa
                        ? <button className="btn danger sm" disabled={ocupado || semMigration} onClick={() => mudarChave(false)}><i className="ti ti-power" /> Desligar para todos</button>
                        : <button className="btn primary sm" disabled={ocupado || semMigration} onClick={() => mudarChave(true)}><i className="ti ti-power" /> Ligar</button>}
                </div>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.55 }}>
                    Quanto cada um usa (análises e currículos adaptados somam): <b>teste grátis de 48 h</b> a partir do primeiro uso, com 1 análise e 1 currículo adaptado;
                    depois, <b>plano de IA</b> por R$ 5 (30 dias, 10 usos), que quem comprou o Automático já ganha junto. As extras de cada pessoa somam aos dois.
                </div>
            </div>

            {/* ---- Aba 2: versões + envio com IA ---- */}
            <div className="card" style={{ padding: 18, marginBottom: 16 }}>
                <div className="section-title" style={{ marginBottom: 10 }}><i className="ti ti-files" /> Aba "Um currículo por tipo de vaga" e envio com IA</div>
                <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className={`badge ${d.controle.versoesAtivas ? 'ok' : 'warn'}`}>{d.controle.versoesAtivas ? 'Ligada' : 'Desligada'}</span>
                    <span className="muted" style={{ fontSize: 13, flex: 1, minWidth: 200 }}>
                        {d.controle.versoesAtivas
                            ? 'Quem tem o plano com IA vê a aba, cria versões e os envios dele levam a versão aprovada.'
                            : 'A aba sumiu para todos (menos você) e todos os envios levam o currículo do perfil. As versões continuam salvas.'}
                    </span>
                    {d.controle.versoesAtivas
                        ? <button className="btn danger sm" disabled={ocupado || semMigration} onClick={() => mudarVersoes(false)}><i className="ti ti-power" /> Desligar para todos</button>
                        : <button className="btn primary sm" disabled={ocupado || semMigration} onClick={() => mudarVersoes(true)}><i className="ti ti-power" /> Ligar</button>}
                </div>
                {d.versoes && (
                    <div className="muted" style={{ fontSize: 13, marginTop: 12 }}>
                        {nf(d.versoes.total)} versões criadas ({nf(d.versoes.aprovadas)} aprovadas) por {nf(d.versoes.pessoas)} pessoa(s) · {nf(d.versoes.enviosComIa)} envio(s) com a versão da IA, {nf(d.versoes.enviosComIa7d)} nos últimos 7 dias
                    </div>
                )}
            </div>

            {/* ---- Números ---- */}
            <div className="stats-grid">
                {[
                    { l: 'análises no total', v: nf(n.total), i: 'ti-file-cv' },
                    { l: 'últimas 24 h', v: nf(n.ultimas24h), i: 'ti-clock' },
                    { l: 'últimos 7 dias', v: nf(n.ultimos7d), i: 'ti-calendar' },
                    { l: 'pessoas que usaram', v: nf(n.pessoas), i: 'ti-users' },
                    { l: 'com a IA liberada', v: nf(n.iaLiberada), i: 'ti-sparkles', sub: n.emTeste != null ? `${nf(n.emTeste)} no teste de 48 h agora` : '' },
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
                <div className="section-title"><i className="ti ti-user-cog" /> Liberar, bloquear ou dar usos a alguém</div>
                <p className="muted" style={{ fontSize: 12.5, marginTop: -6 }}>Pelo email, mesmo de quem nunca usou. Bloqueada, a pessoa não vê as duas abas e os envios dela voltam a levar o currículo do perfil. Quem está bloqueado aparece no topo da lista abaixo.</p>
                <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <input className="input" style={{ flex: 2, minWidth: 220 }} placeholder="email da conta" value={email} onChange={(e) => setEmail(e.target.value)} />
                    <input className="input" style={{ width: 90 }} type="number" min={0} max={d.extrasMaximo} title="Análises extras" value={extras} onChange={(e) => setExtras(e.target.value)} />
                    <input className="input" style={{ flex: 2, minWidth: 180 }} placeholder="motivo (opcional, só você vê)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                    <button className="btn ghost sm" disabled={ocupado || semMigration || !email.trim()} onClick={() => porEmail('extras')}><i className="ti ti-plus" /> Definir extras</button>
                    <button className="btn ghost sm" disabled={ocupado || semMigration || !email.trim()} onClick={() => porEmail('liberar')}><i className="ti ti-sparkles" /> Liberar IA 30 dias</button>
                    <button className="btn ghost sm" disabled={ocupado || semMigration || !email.trim()} onClick={() => porEmail('desbloquear')}><i className="ti ti-lock-open" /> Desbloquear</button>
                    <button className="btn danger sm" disabled={ocupado || semMigration || !email.trim()} onClick={() => porEmail('bloquear')}><i className="ti ti-ban" /> Bloquear</button>
                </div>
            </div>

            {/* ---- Pessoas ---- */}
            <div className="section-title" style={{ marginTop: 8 }}><i className="ti ti-users" /> Quem usou ou tem ajuste ({nf(d.pessoas.length)})</div>
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
