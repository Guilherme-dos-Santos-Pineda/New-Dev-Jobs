import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../components/Toast.jsx';
import { haQuanto, emQuanto, aCada } from '../lib/tempo.js';

// =========================
// Robôs (antes "Bots & Scraper")
// =========================
// A tela antiga era um formulário de API: queries entre aspas, páginas, "máx.
// posts por query", checkbox de contentType, seletor de recrutadores e uma
// tabela com ações em massa para 305 robôs. Servia para configurar o actor, não
// para responder o que o dono quer saber ao abrir: "está funcionando? achou
// vaga? quanto gastou?". Agora a tela responde isso em cima, e o resto é ligar,
// desligar, mudar a frequência e rodar agora. A busca avulsa fica escondida em
// "Avançado".

const FREQUENCIAS = [120, 360, 720, 1440];
const ROTULO = { monitor: 'Monitorar recrutadores', descoberta: 'Descobrir recrutadores novos' };
const EXPLICA = {
    monitor: 'Visita 10 recrutadores por vez e lê as vagas que eles postaram na última semana. Todo recrutador com vaga no Brasil é visitado uma vez por semana.',
    descoberta: 'Procura #vagati no LinkedIn inteiro. Quem posta vaga com email vira recrutador monitorado sozinho.',
};
const tipoDe = (robo) => (robo.params?.source === 'global' ? 'descoberta' : 'monitor');
const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const usd = (v) => (v == null ? '' : `US$ ${Number(v).toFixed(2).replace('.', ',')}`);

// Resultado de uma execução em uma frase, sem o JSON de stats.
function resumoRun(run) {
    if (!run) return 'Ainda não rodou';
    if (run.status === 'queued') return 'Na fila, começa em instantes';
    if (run.status === 'running') return 'Rodando agora…';
    if (run.status === 'failed') return `Falhou: ${run.error || 'erro desconhecido'}`;
    const s = run.stats || {};
    const novas = s.novos ?? 0;
    return `${nf(novas)} vaga${novas === 1 ? '' : 's'} nova${novas === 1 ? '' : 's'} de ${nf(s.found ?? 0)} posts lidos`;
}

// Os campos de stats que valem mostrar, com nome de gente.
const DETALHES = [
    ['found', 'Posts lidos'], ['novos', 'Vagas novas'], ['duplicados', 'Já existiam'],
    ['semEmail', 'Sem email (descartados)'], ['foraRegiao', 'Fora do Brasil'],
    ['descartadosIA', 'Não eram vaga (IA)'], ['rejeitados', 'Bloqueados antes'],
    ['recruiters', 'Recrutadores visitados'], ['recrutadoresAdd', 'Recrutadores novos'], ['aiUsed', 'Leituras da IA'],
];

function Liga({ ligado, onChange, disabled, rotulo }) {
    return (
        <button type="button" role="switch" aria-checked={ligado} aria-label={rotulo}
            className={`liga ${ligado ? 'on' : ''}`} disabled={disabled} onClick={() => onChange(!ligado)}>
            <span />
        </button>
    );
}

export default function BotsPanel() {
    const toast = useToast();
    const [d, setD] = useState(null);
    const [erro, setErro] = useState('');
    const [aberto, setAberto] = useState(null);     // run com detalhes abertos
    const [avancado, setAvancado] = useState(false);
    const [salvando, setSalvando] = useState('');   // id do robô sendo alterado
    const trava = useRef(false);

    const carregar = useCallback(async () => {
        try { setD(await api.adminRobots()); setErro(''); }
        catch (e) { setErro(e.message); }
    }, []);
    useEffect(() => { carregar(); }, [carregar]);

    // Enquanto houver execução na fila ou rodando, atualiza sozinho e avisa ao fim.
    const ativos = (d?.runs || []).filter((r) => r.status === 'queued' || r.status === 'running').map((r) => r.id);
    const chaveAtivos = ativos.join(',');
    useEffect(() => {
        if (!chaveAtivos) return;
        const antes = new Set(chaveAtivos.split(','));
        const iv = setInterval(async () => {
            try {
                const novo = await api.adminRobots();
                setD(novo);
                const fim = novo.runs.find((r) => antes.has(String(r.id)) && (r.status === 'done' || r.status === 'failed'));
                if (fim) toast.show(fim.status === 'done' ? `Robô terminou: ${resumoRun(fim)}` : resumoRun(fim), fim.status === 'done' ? 'success' : 'error');
            } catch { /* tenta de novo no próximo ciclo */ }
        }, 5000);
        return () => clearInterval(iv);
    }, [chaveAtivos, toast]);

    async function alterar(robo, patch, msg) {
        setSalvando(robo.id);
        try { await api.adminUpdateSchedule(robo.id, patch); if (msg) toast.show(msg); await carregar(); }
        catch (e) { toast.show(e.message, 'error'); }
        finally { setSalvando(''); }
    }

    async function rodarAgora(robo) {
        if (trava.current) return;
        trava.current = true;
        try { await alterar(robo, { runNow: true }, 'Vai rodar em até 1 minuto.'); }
        finally { setTimeout(() => { trava.current = false; }, 1500); }
    }

    if (erro && !d) return <div className="notice danger"><i className="ti ti-alert-circle" />{erro}</div>;
    if (!d) return <div className="card center" style={{ padding: 40 }}><div className="spinner" /></div>;

    const s = d.semana || {};
    const ligados = d.robots.filter((r) => r.active);
    const proxima = ligados.map((r) => r.nextRunAt).filter(Boolean).sort()[0];
    const cobertura = s.monitorados ? Math.round((s.visitados / s.monitorados) * 100) : 0;
    const credito = d.apify ? Math.min(100, Math.round((d.apify.usado / (d.apify.limite || 1)) * 100)) : 0;

    return (
        <div className="robos">
            {/* ---- Está funcionando? ---- */}
            <div className={`card robos-status ${ligados.length ? 'ok' : 'off'}`}>
                <span className="robos-status-ico"><i className={`ti ${ligados.length ? 'ti-robot' : 'ti-robot-off'}`} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="robos-status-titulo">
                        {ligados.length ? 'Os robôs estão ligados' : 'Os robôs estão desligados'}
                    </div>
                    <div className="muted" style={{ fontSize: 13 }}>
                        {ligados.length
                            ? (proxima ? `Próxima busca ${emQuanto(proxima)}.` : 'Rodando.')
                            : 'Nenhuma vaga nova vai entrar até ligar um deles abaixo.'}
                        {s.falhas7d ? ` ${s.falhas7d} execução(ões) falharam nos últimos 7 dias.` : ''}
                    </div>
                </div>
                <button className="btn ghost sm" onClick={carregar} title="Atualizar"><i className="ti ti-refresh" /></button>
            </div>

            {/* ---- Achou vaga? Quanto gastou? ---- */}
            <div className="card kpi-faixa" style={{ marginTop: 14 }}>
                <div className="kpi-cel">
                    <div className="kpi-cel-label"><i className="ti ti-briefcase" /> Vagas novas (7 dias)</div>
                    <div className="kpi-cel-num">{nf(s.novas7d)}</div>
                    <div className="kpi-cel-sub">{nf(s.feed7d)} entraram no feed</div>
                </div>
                <div className="kpi-cel">
                    <div className="kpi-cel-label"><i className="ti ti-users" /> Recrutadores nesta volta</div>
                    <div className="kpi-cel-num">{nf(s.visitados)} <span className="kpi-cel-de">de {nf(s.monitorados)}</span></div>
                    <div className="progress" style={{ marginTop: 8 }}><span style={{ width: `${cobertura}%` }} /></div>
                    <div className="kpi-cel-sub">visitados nos últimos {d.diasEntreVisitas} dias</div>
                </div>
                <div className="kpi-cel">
                    <div className="kpi-cel-label"><i className="ti ti-coin" /> Crédito da Apify (mês)</div>
                    {d.apify ? (<>
                        <div className="kpi-cel-num">{usd(d.apify.usado)} <span className="kpi-cel-de">de {usd(d.apify.limite)}</span></div>
                        <div className={`progress ${credito >= 85 ? 'alerta' : ''}`} style={{ marginTop: 8 }}><span style={{ width: `${credito}%` }} /></div>
                        <div className="kpi-cel-sub">sobram {usd(d.apify.restante)}</div>
                    </>) : <div className="kpi-cel-sub" style={{ marginTop: 10 }}>não deu para consultar agora</div>}
                </div>
                <div className="kpi-cel">
                    <div className="kpi-cel-label"><i className="ti ti-file-text" /> Posts lidos (7 dias)</div>
                    <div className="kpi-cel-num">{nf(s.posts7d)}</div>
                    <div className="kpi-cel-sub">em {nf(s.runs7d)} execuções</div>
                </div>
            </div>

            {/* ---- Os robôs ---- */}
            <div className="robos-grade">
                {d.robots.map((robo) => {
                    const tipo = tipoDe(robo);
                    const ult = robo.ultima;
                    const ocupado = salvando === robo.id;
                    const rodando = ult && (ult.status === 'queued' || ult.status === 'running');
                    return (
                        <div key={robo.id} className={`card robo ${robo.active ? '' : 'desligado'}`}>
                            <div className="robo-topo">
                                <span className="robo-ico"><i className={`ti ${tipo === 'monitor' ? 'ti-radar' : 'ti-world-search'}`} /></span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div className="robo-nome">{ROTULO[tipo]}</div>
                                    <div className="muted" style={{ fontSize: 12 }}>{robo.active ? `Ligado, ${aCada(robo.intervalMinutes)}` : 'Desligado'}</div>
                                </div>
                                <Liga ligado={robo.active} disabled={ocupado} rotulo={`Ligar ${ROTULO[tipo]}`}
                                    onChange={(v) => alterar(robo, { active: v }, v ? 'Robô ligado.' : 'Robô desligado.')} />
                            </div>
                            <p className="robo-explica">{EXPLICA[tipo]}</p>

                            <div className={`robo-ultima ${ult?.status === 'failed' ? 'falhou' : ''}`}>
                                <i className={`ti ${rodando ? 'ti-loader-2 spin' : ult?.status === 'failed' ? 'ti-alert-triangle' : 'ti-circle-check'}`} />
                                <div style={{ minWidth: 0 }}>
                                    <div>{resumoRun(ult)}</div>
                                    {ult && <div className="muted" style={{ fontSize: 11.5 }}>{haQuanto(ult.createdAt)}{robo.active && robo.nextRunAt && !rodando ? ` · próxima ${emQuanto(robo.nextRunAt)}` : ''}</div>}
                                </div>
                            </div>

                            <div className="robo-acoes">
                                <label className="muted" style={{ fontSize: 12 }}>Frequência</label>
                                <select className="select" value={robo.intervalMinutes} disabled={ocupado}
                                    onChange={(e) => alterar(robo, { intervalMinutes: Number(e.target.value) }, 'Frequência alterada.')}>
                                    {[...new Set([...FREQUENCIAS, robo.intervalMinutes])].sort((a, b) => a - b)
                                        .map((m) => <option key={m} value={m}>{aCada(m)}</option>)}
                                </select>
                                <button className="btn ghost sm" disabled={ocupado || rodando} onClick={() => rodarAgora(robo)}>
                                    <i className="ti ti-player-play" /> Rodar agora
                                </button>
                            </div>
                        </div>
                    );
                })}
                {d.robots.length === 0 && (
                    <div className="card empty" style={{ padding: 26 }}><i className="ti ti-robot-off" />Nenhum robô cadastrado.</div>
                )}
            </div>

            {/* ---- O que aconteceu ---- */}
            <div className="section-title" style={{ marginTop: 22 }}><i className="ti ti-history" /> Últimas execuções</div>
            <div className="card lista-card">
                {d.runs.length === 0 && <div className="empty" style={{ padding: 22 }}><i className="ti ti-clock-off" />Nenhuma execução ainda.</div>}
                {d.runs.map((run) => {
                    const tipo = run.params?.source === 'global' ? 'descoberta' : 'monitor';
                    const avulsa = !run.params?.scheduleId;
                    return (
                        <div key={run.id}>
                            <button className="linha" onClick={() => setAberto(aberto === run.id ? null : run.id)} aria-expanded={aberto === run.id}>
                                <span className={`linha-ico ${run.status === 'done' ? 'ok' : run.status === 'failed' ? 'danger' : ''}`}>
                                    <i className={`ti ${run.status === 'done' ? 'ti-circle-check' : run.status === 'failed' ? 'ti-alert-triangle' : 'ti-loader-2 spin'}`} />
                                </span>
                                <span className="linha-txt">
                                    <span className="linha-titulo">{resumoRun(run)}</span>
                                    <span className="linha-sub">{avulsa ? 'Busca avulsa' : ROTULO[tipo]}</span>
                                </span>
                                <span className="linha-para">{haQuanto(run.createdAt)}</span>
                                <i className={`ti ${aberto === run.id ? 'ti-chevron-up' : 'ti-chevron-down'} linha-seta`} />
                            </button>
                            {aberto === run.id && (
                                <div className="run-detalhe">
                                    {DETALHES.filter(([k]) => run.stats?.[k] != null).map(([k, rotulo]) => (
                                        <div key={k} className="run-num"><span>{rotulo}</span><b>{nf(run.stats[k])}</b></div>
                                    ))}
                                    {run.error && <div className="notice danger" style={{ gridColumn: '1 / -1' }}><i className="ti ti-alert-circle" />{run.error}</div>}
                                    {!run.stats && !run.error && <div className="muted">Sem resultado ainda.</div>}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ---- Avançado ---- */}
            <button className="btn ghost sm" style={{ marginTop: 18 }} onClick={() => setAvancado((v) => !v)} aria-expanded={avancado}>
                <i className={`ti ${avancado ? 'ti-chevron-up' : 'ti-adjustments'}`} /> {avancado ? 'Fechar avançado' : 'Avançado: busca avulsa'}
            </button>
            {avancado && <BuscaAvulsa onRodou={carregar} />}
        </div>
    );
}

// Uma busca de uma vez só no LinkedIn inteiro, para testar uma ideia de query
// sem criar robô. Mostra o custo máximo antes, porque cada post é cobrado.
function BuscaAvulsa({ onRodou }) {
    const toast = useToast();
    const [query, setQuery] = useState('#vagati OR #vagasti');
    const [posts, setPosts] = useState(30);
    const [periodo, setPeriodo] = useState('week');
    const [enviando, setEnviando] = useState(false);
    const custo = `US$ ${(posts * 0.002).toFixed(2).replace('.', ',')}`;

    async function buscar(e) {
        e.preventDefault();
        if (!query.trim() || enviando) return;
        if (!window.confirm(`Buscar até ${posts} posts? Custa no máximo ${custo} de crédito da Apify.`)) return;
        setEnviando(true);
        try {
            await api.adminRunScraper('monitoring', {
                source: 'global', queries: [query.trim()], maxPosts: posts, postedLimit: periodo,
                sortBy: 'date', contentType: 'all', region: 'br',
            });
            toast.show('Busca enviada. O resultado aparece em "Últimas execuções".');
            onRodou();
        } catch (err) { toast.show(err.message, 'error'); }
        finally { setEnviando(false); }
    }

    return (
        <form className="card" style={{ marginTop: 10 }} onSubmit={buscar}>
            <div className="field">
                <label>O que procurar no LinkedIn</label>
                <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder='#vagati OR "vaga desenvolvedor"' />
                <div className="hint">Use OR entre termos e aspas para frase exata. Só entra vaga com email e do Brasil.</div>
            </div>
            <div className="grid-2">
                <div className="field">
                    <label>Quantos posts</label>
                    <select className="select" value={posts} onChange={(e) => setPosts(Number(e.target.value))}>
                        {[20, 30, 50, 100].map((n) => <option key={n} value={n}>{n} posts</option>)}
                    </select>
                </div>
                <div className="field">
                    <label>Postados nos últimos</label>
                    <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
                        <option value="24h">1 dia</option><option value="week">7 dias</option><option value="month">30 dias</option>
                    </select>
                </div>
            </div>
            <button className="btn primary sm" disabled={enviando || !query.trim()}>
                <i className="ti ti-search" /> {enviando ? 'Enviando…' : `Buscar (até ${custo})`}
            </button>
        </form>
    );
}
