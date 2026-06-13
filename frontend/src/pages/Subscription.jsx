import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCachedResource } from '../lib/useCachedResource.js';

const money = (cents, currency = 'brl') =>
    ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: (currency || 'brl').toUpperCase() });
const fmtDate = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

export default function Subscription() {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [busy, setBusy] = useState('');

    const { data: plansData, loading: loadingPlans } = useCachedResource('billing:plans', () => api.getPlans());
    const { data: histData, loading: loadingHist, refresh: refreshHist } = useCachedResource('billing:history', () => api.billingHistory());

    const plans = plansData?.plans || [];
    const stripeEnabled = plansData?.stripeEnabled;
    const invoices = histData?.invoices || [];
    const current = user?.plan || 'free';
    const usage = user?.usage;
    const hasSub = invoices.length > 0 || current !== 'free';

    // Retorno do checkout
    useEffect(() => {
        const c = params.get('checkout');
        if (!c) return;
        if (c === 'success') { toast.show('Pagamento concluído! Atualizando seu plano…'); refreshUser(); refreshHist(); }
        else if (c === 'cancel') toast.show('Checkout cancelado.', 'error');
        params.delete('checkout'); setParams(params, { replace: true });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function upgrade(planId) {
        setBusy(planId);
        try { const { url } = await api.checkout(planId); window.location.href = url; }
        catch (e) { toast.show(e.message, 'error'); setBusy(''); }
    }
    async function manage() {
        setBusy('portal');
        try { const { url } = await api.billingPortal(); window.location.href = url; }
        catch (e) { toast.show(e.message, 'error'); setBusy(''); }
    }

    const pct = usage ? Math.min(100, Math.round((usage.usedToday / Math.max(1, usage.dailyLimit)) * 100)) : 0;

    return (
        <div className="page" style={{ maxWidth: 980 }}>
            <div className="page-head">
                <h1>Assinatura</h1>
                <p>Gerencie seu plano, uso e pagamentos.</p>
            </div>

            {/* Resumo do plano atual + uso */}
            <div className="card fade-in" style={{ marginBottom: 18 }}>
                <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div className="kpi-ico" style={{ width: 44, height: 44, fontSize: 22 }}><i className="ti ti-crown" /></div>
                    <div>
                        <div className="muted" style={{ fontSize: 12 }}>Plano atual</div>
                        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' }}>
                            {plans.find((p) => p.id === current)?.label || current}
                        </div>
                    </div>
                    <div className="spacer" />
                    {hasSub && stripeEnabled && (
                        <button className="btn" disabled={busy === 'portal'} onClick={manage}>
                            <i className="ti ti-settings" /> {busy === 'portal' ? 'Abrindo…' : 'Gerenciar / Cancelar'}
                        </button>
                    )}
                </div>
                {usage && (
                    <div style={{ marginTop: 18 }}>
                        <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                            <span className="muted">Envios hoje</span>
                            <span className="mono"><b>{usage.usedToday}</b> / {usage.dailyLimit}</span>
                        </div>
                        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{usage.remainingToday} envios restantes hoje.</div>
                    </div>
                )}
            </div>

            {/* Planos */}
            {!stripeEnabled && <div className="notice danger"><i className="ti ti-alert-circle" />Pagamentos não configurados no servidor.</div>}
            <div className="cards-grid" style={{ marginBottom: 22 }}>
                {loadingPlans
                    ? [0, 1, 2].map((i) => <div key={i} className="skeleton sk-card" />)
                    : plans.map((p, i) => {
                        const isCurrent = p.id === current;
                        const featured = p.id === 'pro';
                        return (
                            <div key={p.id} className={`card fade-in d${i + 1} ${featured ? 'feature-card' : ''}`}
                                style={!featured && isCurrent ? { borderColor: 'var(--color-accent)' } : undefined}>
                                <div className="row" style={{ alignItems: 'center' }}>
                                    <strong style={{ fontSize: 16 }}>{p.label}</strong>
                                    {isCurrent && <span className="badge ok" style={{ marginLeft: 'auto' }}>atual</span>}
                                    {!isCurrent && featured && <span className="badge" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,.2)', color: '#fff' }}>popular</span>}
                                </div>
                                <ul style={{ margin: '12px 0 16px', paddingLeft: 18, fontSize: 13.5, lineHeight: 1.9 }}>
                                    <li><b>{p.dailyLimit}</b> envios por dia</li>
                                    <li>{p.allowManual ? 'Seleção manual de vagas' : 'Envio automático'}</li>
                                    <li>{p.id === 'free' ? 'Para começar' : 'Suporte prioritário'}</li>
                                </ul>
                                {isCurrent ? (
                                    <button className="btn block sm" disabled>Plano atual</button>
                                ) : p.purchasable ? (
                                    <button className={`btn block sm ${featured ? '' : 'primary'}`} disabled={!!busy || !stripeEnabled} onClick={() => upgrade(p.id)}>
                                        {busy === p.id ? 'Redirecionando…' : (<><i className="ti ti-arrow-up-circle" /> Assinar {p.label}</>)}
                                    </button>
                                ) : (
                                    <button className="btn block sm" disabled>{p.id === 'free' ? 'Grátis' : 'Indisponível'}</button>
                                )}
                            </div>
                        );
                    })}
            </div>

            {/* Histórico de pagamentos */}
            <div className="card fade-in">
                <div className="section-title"><i className="ti ti-receipt" /> Histórico de pagamentos</div>
                {loadingHist ? (
                    <div><div className="skeleton sk-line" style={{ width: '60%' }} /><div className="skeleton sk-line" style={{ width: '40%' }} /></div>
                ) : invoices.length === 0 ? (
                    <div className="empty" style={{ padding: 28 }}><i className="ti ti-receipt-off" />Nenhum pagamento ainda.</div>
                ) : (
                    <div className="dtable-wrap">
                        <table className="dtable">
                            <thead><tr><th>Data</th><th>Valor</th><th>Status</th><th className="col-actions">Fatura</th></tr></thead>
                            <tbody>
                                {invoices.map((inv) => (
                                    <tr key={inv.id}>
                                        <td>{fmtDate(inv.date)}</td>
                                        <td className="mono">{money(inv.amount, inv.currency)}</td>
                                        <td><span className={`badge ${inv.status === 'paid' ? 'ok' : 'neutral'}`}>{inv.status}</span></td>
                                        <td className="col-actions">{inv.url && <a className="btn ghost sm" href={inv.url} target="_blank" rel="noopener"><i className="ti ti-external-link" /> ver</a>}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
