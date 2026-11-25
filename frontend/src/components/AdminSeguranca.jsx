import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from './Toast.jsx';
import { haQuanto } from '../lib/tempo.js';

// =========================
// Admin › Segurança (backend/services/seguranca.js)
// =========================
// Responde "tem alguém tentando copiar as vagas ou os emails?": os alertas de quem
// bateu num teto (desde o último reinício do servidor) e quem mais revelou email de
// recrutador pelo "enviar você mesmo" nos últimos 7 dias.
const dia = (d) => (d ? new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');

export default function AdminSeguranca() {
    const toast = useToast();
    const [d, setD] = useState(null);
    useEffect(() => {
        api.adminSeguranca().then(setD).catch((e) => { toast.show(e.message, 'error'); setD({ erro: true }); });
    }, []);

    if (!d) return <div className="card" style={{ padding: 18 }}><div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} /></div>;
    if (d.erro) return <div className="card empty" style={{ padding: 24 }}><i className="ti ti-alert-triangle" /><div>Não deu para carregar.</div></div>;

    const t = d.tetos;
    return (<>
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                {d.alertas.length === 0 ? <><i className="ti ti-shield-check" style={{ color: 'var(--color-success)' }} /> Nenhum alerta desde o último reinício.</> : <><i className="ti ti-alert-triangle" style={{ color: 'var(--color-warn)' }} /> {d.alertas.length} alerta(s) desde o último reinício.</>}
            </div>
            <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.6 }}>
                Travas: o feed e o detalhe nunca mostram email; o detalhe só abre vaga do feed ou já enviada, até {t.detalhePorDia} por conta por dia;
                a lista de vagas tem limite por conta (120 a cada 15 min); o "enviar você mesmo" revela no máximo {t.revelarPorIpDia} emails por dia por rede (somando todas as contas) e não funciona com email temporário.
                Na semana, {d.revelados7d.n} email(s) revelados por {d.revelados7d.pessoas} pessoa(s).
            </div>
        </div>

        {d.alertas.length > 0 && (
            <div className="card lista-card" style={{ marginBottom: 14 }}>
                {d.alertas.slice(0, 50).map((a, i) => (
                    <div key={i} style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border-light)', fontSize: 13 }}>
                        <strong>{a.tipo}</strong> · {a.email || a.ip || ''}{a.n ? ` · ${a.n}` : ''} <span className="muted">· {haQuanto(a.em)}</span>
                    </div>
                ))}
            </div>
        )}

        <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>Quem mais revelou email ("enviar você mesmo", 7 dias)</h3>
        {d.revelaram.length === 0 ? (
            <div className="card empty" style={{ padding: 20 }}><div>Ninguém nesta semana.</div></div>
        ) : (
            <div className="card lista-card" style={{ marginBottom: 14 }}>
                {d.revelaram.map((r) => (
                    <div key={r.id} className="row" style={{ padding: '10px 16px', gap: 10, borderBottom: '1px solid var(--color-border-light)', fontSize: 13, flexWrap: 'wrap' }}>
                        <span style={{ flex: 1, minWidth: 200 }}><strong>{r.nome || r.email}</strong> <span className="muted">{r.email} · conta de {dia(r.criadaEm)}</span></span>
                        <span className="badge">{r.revelados} em {r.dias} dia(s)</span>
                        <span className={`badge ${r.gmail ? 'ok' : 'warn'}`}>{r.gmail ? `Gmail, ${r.enviosGmail} envios` : 'sem Gmail'}</span>
                    </div>
                ))}
            </div>
        )}

        <h3 style={{ fontSize: 15, margin: '0 0 6px' }}>Contas novas por dia (14 dias)</h3>
        <div className="card" style={{ padding: '10px 16px', fontSize: 13 }}>
            {d.contas.map((c) => <span key={c.dia} style={{ marginRight: 14, whiteSpace: 'nowrap' }}>{dia(c.dia)}: <strong>{c.contas}</strong></span>)}
        </div>
    </>);
}
