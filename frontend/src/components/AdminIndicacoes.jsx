import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// =========================
// Admin › Indicações (backend/services/indicacao.js, painelIndicacoesAdmin)
// =========================
// Responde primeiro "a indicação está trazendo gente, e essa gente usa?"; depois
// quem indica, em que pé está cada indicado e de onde vêm as contas novas.
const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const dia = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

/** Em que pé está o indicado: do cadastro ao prêmio. */
function etapa(i) {
    if (i.mesmoGmail) return { tom: 'danger', texto: 'Suspeito: mesmo Gmail de quem indicou' };
    if (i.premiadoEm) return { tom: 'ok', texto: `Premiado em ${dia(i.premiadoEm)}` };
    if (i.envios > 0) return { tom: 'info', texto: 'Só "enviar você mesmo" (não premia)' };
    if (i.gmail) return { tom: 'warn', texto: 'Conectou o Gmail, falta enviar' };
    if (i.perfil) return { tom: 'warn', texto: 'Fez o perfil, falta o Gmail' };
    return { tom: 'neutral', texto: 'Só criou a conta' };
}

export default function AdminIndicacoes() {
    const toast = useToast();
    const [d, setD] = useState(null);

    async function carregar() {
        try { setD(await api.adminIndicacoes()); } catch (e) { toast.show(e.message, 'error'); setD({ erro: true }); }
    }
    useEffect(() => { carregar(); }, []);

    if (!d) return <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>;
    if (d.erro) return <div className="card empty" style={{ padding: 24 }}><i className="ti ti-alert-triangle" /><div>Não deu para carregar.</div></div>;

    const r = d.resumo;
    const vis = Object.fromEntries((d.visitas || []).map((v) => [v.canal, v.n]));

    return (<>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
                ['Contas indicadas', r.indicados, `${nf(r.quemIndicou)} pessoa(s) indicaram`],
                ['Premiadas', r.premiados, 'o indicado já enviou pelo Gmail'],
                ['Aguardando o 1º envio', r.aguardando, 'o bônus ainda não saiu'],
                ['Com bônus agora', r.comBonus, '+10 envios por dia'],
                ['Abriram o próprio link', r.geraramLink, `${nf(r.visitasPorLink)} visita(s) por link em 30 dias`],
            ].map(([titulo, n, sub]) => (
                <div key={titulo} className="card" style={{ padding: 14, flex: '1 1 150px' }}>
                    <div className="muted" style={{ fontSize: 12.5 }}>{titulo}</div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{nf(n)}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{sub}</div>
                </div>
            ))}
            <button className="btn ghost sm" style={{ alignSelf: 'center' }} onClick={carregar}><i className="ti ti-reload" /> Atualizar</button>
        </div>

        <h3 style={{ margin: '0 0 8px' }}>Quem indica</h3>
        {d.quemIndica.length === 0 ? (
            <div className="card empty" style={{ padding: 24, marginBottom: 16 }}><i className="ti ti-gift" /><div>Ninguém entrou pelo link de alguém ainda.</div></div>
        ) : (
            <div className="card lista-card" style={{ marginBottom: 16 }}>
                {d.quemIndica.map((q) => (
                    <div key={q.id} className="row" style={{ padding: '10px 18px', borderBottom: '1px solid var(--color-border-light)', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                            <b>{q.nome || q.email}</b> <span className="muted">· {q.email}</span>
                            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                                código {q.codigo} · última indicação {haQuanto(q.ultima)}{q.plano !== 'free' ? ` · plano ${q.plano}` : ''}
                            </div>
                        </div>
                        <span className="badge neutral">{nf(q.indicados)} indicado(s)</span>
                        <span className={`badge ${q.premiados ? 'ok' : 'neutral'}`}>{nf(q.premiados)} premiado(s)</span>
                        {q.bonusAte && new Date(q.bonusAte) > new Date() && <span className="badge info">bônus até {dia(q.bonusAte)}</span>}
                    </div>
                ))}
            </div>
        )}

        <h3 style={{ margin: '0 0 8px' }}>Indicados</h3>
        {d.indicados.length === 0 ? (
            <div className="card empty" style={{ padding: 24, marginBottom: 16 }}><i className="ti ti-user-plus" /><div>Nenhum indicado ainda.</div></div>
        ) : (
            <div className="card lista-card" style={{ marginBottom: 16 }}>
                {d.indicados.map((i) => {
                    const e = etapa(i);
                    return (
                        <div key={i.id} className="row" style={{ padding: '10px 18px', borderBottom: '1px solid var(--color-border-light)', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <b>{i.nome || i.email}</b> <span className="muted">· {i.email}</span>
                                <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                                    entrou {dia(i.criadoEm)} · indicado por {i.quemNome || i.quemEmail} · {nf(i.envios)} envio(s)
                                </div>
                            </div>
                            <span className={`badge ${e.tom}`}>{e.texto}</span>
                        </div>
                    );
                })}
            </div>
        )}

        <h3 style={{ margin: '0 0 8px' }}>De onde vêm as contas <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>· contas desde 15/11, visitas dos últimos 30 dias</span></h3>
        <div className="card lista-card">
            <div className="row" style={{ padding: '8px 18px', borderBottom: '1px solid var(--color-border-light)', gap: 10, fontSize: 12.5 }}>
                <span className="muted" style={{ flex: 1 }}>canal</span>
                {['visitas', 'contas', 'enviaram', 'pagaram'].map((c) => <span key={c} className="muted" style={{ width: 70, textAlign: 'right' }}>{c}</span>)}
            </div>
            {[...new Set([...d.origens.map((o) => o.canal), ...(d.visitas || []).map((v) => v.canal)])].map((canal) => {
                const o = d.origens.find((x) => x.canal === canal) || {};
                return (
                    <div key={canal} className="row" style={{ padding: '8px 18px', borderBottom: '1px solid var(--color-border-light)', gap: 10, alignItems: 'center' }}>
                        <span style={{ flex: 1 }}>{canal}</span>
                        {[vis[canal], o.contas, o.enviaram, o.pagaram].map((n, k) => <span key={k} style={{ width: 70, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{n == null ? '' : nf(n)}</span>)}
                    </div>
                );
            })}
        </div>
    </>);
}
