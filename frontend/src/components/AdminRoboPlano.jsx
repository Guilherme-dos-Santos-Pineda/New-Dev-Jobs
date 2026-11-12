import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// Admin › Robô dos pagantes: UM robô por pessoa (backend/services/roboPessoal.js).
// Responde primeiro "quem está ficando sem vaga?" e, para cada pessoa, o que o
// robô dela fez e quando roda de novo. O dono achou a tela antiga confusa
// (12/11/2026): ela listava buscas do dia e execuções de um robô só.
const nf = (n) => (n ?? 0).toLocaleString('pt-BR');
const data = (d) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function situacao(p) {
    if (p.estoque == null) return { tom: 'neutral', texto: 'não deu para contar as vagas agora' };
    if (p.dias == null) return { tom: 'info', texto: `${nf(p.estoque)} vagas para enviar (não está enviando)` };
    if (p.dias < 3) return { tom: 'danger', texto: `${nf(p.estoque)} vagas: acaba em ${p.dias <= 0 ? 'menos de 1 dia' : `${p.dias} dia(s)`}` };
    if (p.dias < 14) return { tom: 'warn', texto: `${nf(p.estoque)} vagas: dá para ${p.dias} dias` };
    return { tom: 'ok', texto: `${nf(p.estoque)} vagas: dá para ${p.dias} dias` };
}

export default function AdminRoboPlano() {
    const toast = useToast();
    const [d, setD] = useState(null);
    const [aberto, setAberto] = useState(null);
    const trava = useRef(false);

    async function carregar() {
        try { setD(await api.adminRoboPlano()); } catch (e) { toast.show(e.message, 'error'); setD({ erro: true }); }
    }
    useEffect(() => { carregar(); }, []);

    async function rodar(p) {
        if (trava.current) return;
        trava.current = true;
        try {
            await api.adminRodarRobo(p.userId);
            toast.show(`Robô de ${p.nome || 'pagante'} rodando. Leva alguns minutos.`, 'success');
            setTimeout(carregar, 4000);
        } catch (e) { toast.show(e.message, 'error'); } finally { trava.current = false; }
    }

    if (!d) return <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '60%' }} /></div>;
    if (d.erro) return <div className="card empty" style={{ padding: 28 }}><i className="ti ti-alert-triangle" /><div>Não deu para carregar.</div></div>;

    const faltando = d.pessoas.filter((p) => p.dias != null && p.dias < 14).length;

    return (
        <div>
            <p className="muted" style={{ marginTop: 0 }}>
                Cada pagante tem um robô que busca vagas pelo perfil dele (área e nível), com as frases que mais trazem email.
                Roda às 5h, antes do envio das 9h, a cada {d.rodarACadaDias} dias, quem tem menos vaga primeiro.
            </p>

            {!d.contaPagantes.configurada && (
                <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: 'var(--color-warning, #f59e0b)' }}>
                    <i className="ti ti-alert-triangle" /> A conta da Apify dos pagantes ainda não está configurada (<code>APIFY_TOKEN_PAGANTES</code>). Enquanto isso, o robô usa as outras contas só se sobrar crédito.
                </div>
            )}
            {d.contaPagantes.configurada && !d.contaPagantes.disponivel && (
                <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: 'var(--color-danger)' }}>
                    <i className="ti ti-alert-triangle" /> A conta da Apify dos pagantes está sem crédito ou com a chave recusada.
                </div>
            )}

            <div className="card" style={{ padding: 16, marginBottom: 16 }}>
                <b>{nf(d.pessoas.length)} pagante(s)</b>
                <span className="muted"> · {faltando ? `${faltando} com vaga para menos de 2 semanas` : 'todos com vaga para 2 semanas ou mais'}</span>
            </div>

            {d.pessoas.length === 0 ? (
                <div className="card empty" style={{ padding: 24 }}><i className="ti ti-robot" /><div>Ninguém com plano pago ativo.</div></div>
            ) : (
                <div className="card lista-card">
                    {d.pessoas.map((p) => {
                        const s = situacao(p);
                        const u = p.ultima;
                        return (
                            <div key={p.userId} style={{ padding: '14px 18px', borderBottom: '1px solid var(--color-border-light)' }}>
                                <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <div style={{ flex: 1, minWidth: 220 }}>
                                        <b>{p.nome || 'Sem nome'}</b>{' '}
                                        <span className="muted" style={{ fontSize: 12.5 }}>{p.plano} até {data(p.ate)} · {p.autoEnvio ? 'automático ligado' : 'automático desligado'}</span>
                                        <div style={{ marginTop: 4 }}><span className={`badge ${s.tom}`}>{s.texto}</span></div>
                                        <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                                            {p.rodandoAgora ? 'Robô rodando agora…'
                                                : u ? <>Último robô {haQuanto(u.em)}: {u.status === 'failed' ? `falhou (${u.erro || 'erro'})` : `${nf(u.posts)} posts, ${nf(u.vagasNovas)} vagas novas`}{u.janela === 'month' ? ' (último mês)' : ' (última semana)'}</>
                                                    : 'O robô ainda não rodou para esta pessoa.'}
                                            {' · '}próximo: {p.proxima <= Date.now() ? 'na próxima manhã' : data(p.proxima)}
                                            {p.totalVagasDoRobo ? ` · ${nf(p.totalVagasDoRobo)} vagas trazidas no total` : ''}
                                        </div>
                                    </div>
                                    <button className="btn ghost sm" onClick={() => setAberto(aberto === p.userId ? null : p.userId)}>
                                        <i className="ti ti-search" /> Buscas
                                    </button>
                                    <button className="btn primary sm" disabled={p.rodandoAgora} onClick={() => rodar(p)}>
                                        <i className="ti ti-player-play" /> Rodar agora
                                    </button>
                                </div>
                                {aberto === p.userId && (
                                    <div className="muted" style={{ fontSize: 12.5, marginTop: 10, lineHeight: 1.6 }}>
                                        Áreas: {p.areas.join(', ') || 'nenhuma'} · Níveis: {p.niveis.join(', ') || 'todos'}
                                        <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{p.consultas.map((c) => <li key={c}><code>{c}</code></li>)}</ul>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
