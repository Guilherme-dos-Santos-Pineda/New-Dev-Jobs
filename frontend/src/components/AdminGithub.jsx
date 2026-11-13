import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';
import { AREA_OPTIONS, LEVEL_OPTIONS } from '../utils.js';

// Admin › GitHub: o leitor das vagas dos repositórios de comunidade
// (backend/services/vagasGithub.js). Responde primeiro "está lendo, trouxe vaga
// e alguém mandou currículo?"; depois, o que cada repositório rendeu.
const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const data = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const hora = (d) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const rotulo = (lista, v) => lista.find((o) => o.value === v)?.label || v || '';

function situacao(d) {
    const u = d.leituras[0];
    if (d.rodandoAgora) return { tom: 'info', texto: 'Lendo os repositórios agora' };
    if (!u) return { tom: 'neutral', texto: 'Ainda não leu nenhuma vez pelo agendador' };
    if (u.status === 'failed') return { tom: 'danger', texto: `A última leitura falhou: ${u.erro || 'erro'}` };
    // Mais de 2 intervalos sem ler: o worker parou ou o tick não está rodando.
    if (Date.now() - new Date(u.em).getTime() > d.aCadaHoras * 2 * 3600e3) return { tom: 'warn', texto: `Não lê desde ${haQuanto(u.em)}` };
    if (u.erros.length) return { tom: 'warn', texto: `Leu ${haQuanto(u.em)}, mas ${u.erros.length} repositório(s) deram erro` };
    return { tom: 'ok', texto: `Funcionando: última leitura ${haQuanto(u.em)}` };
}

export default function AdminGithub() {
    const toast = useToast();
    const [d, setD] = useState(null);
    const trava = useRef(false);

    async function carregar() {
        try { setD(await api.adminGithub()); } catch (e) { toast.show(e.message, 'error'); setD({ erro: true }); }
    }
    useEffect(() => { carregar(); }, []);

    async function lerAgora() {
        if (trava.current) return;
        trava.current = true;
        try {
            await api.adminRodarGithub();
            toast.show('Lendo os repositórios. Leva alguns segundos.', 'success');
            setTimeout(carregar, 8000);
        } catch (e) { toast.show(e.message, 'error'); } finally { trava.current = false; }
    }

    if (!d) return <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '60%' }} /></div>;
    if (d.erro) return <div className="card empty" style={{ padding: 28 }}><i className="ti ti-alert-triangle" /><div>Não deu para carregar.</div></div>;

    const s = situacao(d);
    const t = d.totais;
    const repos = d.repos.map((r) => ({ repo: r, ...(d.porRepo[r] || {}) }));
    const janela = d.leituras.find((l) => l.status === 'done')?.dias;

    return (
        <div>
            <p className="muted" style={{ marginTop: 0 }}>
                Vagas publicadas como issue nos repositórios de comunidade do GitHub. A cada {d.aCadaHoras} horas, sem Apify e sem crédito.
                Só entra issue aberta com email na seção "Como se candidatar", e a IA só lê cada issue uma vez.
            </p>

            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <span className={`badge ${s.tom}`}>{s.texto}</span>
                        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                            {d.proxima && !d.rodandoAgora ? `Próxima leitura: ${new Date(d.proxima) <= new Date() ? 'no próximo minuto' : hora(d.proxima)}` : ''}
                        </div>
                    </div>
                    <button className="btn primary sm" disabled={d.rodandoAgora} onClick={lerAgora}>
                        <i className="ti ti-refresh" /> Ler agora
                    </button>
                    <button className="btn ghost sm" onClick={carregar}><i className="ti ti-reload" /> Atualizar</button>
                </div>
            </div>

            <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                {[
                    ['Vagas na semana', t.semana],
                    ['Vagas em 30 dias', t.mes],
                    ['Vagas no total', t.total],
                    ['Currículos enviados', t.envios, t.pessoas ? `${nf(t.pessoas)} pessoa(s)` : 'ninguém ainda'],
                    ['Lidas e descartadas', t.descartadas, 'a IA não confirmou a vaga ou o email'],
                ].map(([titulo, n, sub]) => (
                    <div key={titulo} className="card" style={{ padding: 14, flex: '1 1 150px' }}>
                        <div className="muted" style={{ fontSize: 12.5 }}>{titulo}</div>
                        <div style={{ fontSize: 24, fontWeight: 700 }}>{nf(n)}</div>
                        {sub && <div className="muted" style={{ fontSize: 12 }}>{sub}</div>}
                    </div>
                ))}
            </div>

            <h3 style={{ margin: '0 0 8px' }}>Vagas trazidas</h3>
            {d.vagas.length === 0 ? (
                <div className="card empty" style={{ padding: 24, marginBottom: 16 }}><i className="ti ti-briefcase" /><div>Nenhuma vaga do GitHub ainda.</div></div>
            ) : (
                <div className="card lista-card" style={{ marginBottom: 16 }}>
                    {d.vagas.map((v) => (
                        <div key={v.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--color-border-light)' }}>
                            <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 220 }}>
                                    <b>{v.titulo}</b>{v.empresa ? <span className="muted"> · {v.empresa}</span> : null}
                                    <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                                        {[rotulo(AREA_OPTIONS, v.area), rotulo(LEVEL_OPTIONS, v.nivel), v.br ? 'Brasil' : 'fora do Brasil', v.repo, `entrou ${data(v.em)}`].filter(Boolean).join(' · ')}
                                    </div>
                                </div>
                                <span className={`badge ${v.envios ? 'ok' : 'neutral'}`}>{v.envios ? `${nf(v.envios)} envio(s)` : 'sem envios'}</span>
                                {v.url && <a className="btn ghost sm" href={v.url} target="_blank" rel="noreferrer"><i className="ti ti-external-link" /> Issue</a>}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <h3 style={{ margin: '0 0 8px' }}>Repositórios{janela ? <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}> · issues abertas dos últimos {janela} dias, na última leitura</span> : null}</h3>
            <div className="card lista-card" style={{ marginBottom: 16 }}>
                {repos.map((r) => (
                    <div key={r.repo} className="row" style={{ padding: '10px 18px', borderBottom: '1px solid var(--color-border-light)', gap: 10, alignItems: 'center' }}>
                        <a href={`https://github.com/${r.repo}/issues`} target="_blank" rel="noreferrer" style={{ flex: 1 }}>{r.repo}</a>
                        {r.erro ? <span className="badge danger">{r.erro}</span>
                            : r.issues == null ? <span className="muted" style={{ fontSize: 12.5 }}>sem leitura ainda</span>
                                : <span className="muted" style={{ fontSize: 12.5 }}>{nf(r.issues)} issue(s), {nf(r.comEmail)} com email de candidatura</span>}
                    </div>
                ))}
            </div>

            <h3 style={{ margin: '0 0 8px' }}>Últimas leituras</h3>
            {d.leituras.length === 0 ? (
                <div className="card empty" style={{ padding: 24 }}><i className="ti ti-history" /><div>Nenhuma leitura registrada.</div></div>
            ) : (
                <div className="card lista-card">
                    {d.leituras.map((l) => (
                        <div key={l.id} className="row" style={{ padding: '10px 18px', borderBottom: '1px solid var(--color-border-light)', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <span style={{ minWidth: 110 }}>{hora(l.em)}</span>
                            <span className={`badge ${l.status === 'done' ? 'ok' : l.status === 'failed' ? 'danger' : 'info'}`}>
                                {l.status === 'done' ? 'ok' : l.status === 'failed' ? 'falhou' : 'lendo'}
                            </span>
                            <span className="muted" style={{ fontSize: 12.5, flex: 1 }}>
                                {l.status === 'failed' ? l.erro
                                    : `${nf(l.issues)} nova(s) com email, ${nf(l.jaLidos)} já lida(s), ${nf(l.novos)} vaga(s) nova(s), ${nf(l.ia)} chamada(s) de IA`}
                                {l.por ? ` · pedida por ${l.por}` : ''}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
