import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';

const money = (cents, currency = 'brl') =>
    ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: (currency || 'brl').toUpperCase() });
const fmtDate = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

const SUB_BADGE = { active: 'ok', trialing: 'info', past_due: 'danger', unpaid: 'danger', canceled: 'neutral' };
const SUB_LABEL = { active: 'ativa', trialing: 'teste', past_due: 'pagamento pendente', unpaid: 'não paga', canceled: 'cancelada' };

export default function Subscription() {
    const { user, refreshUser } = useAuth();
    const { t } = useT();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [busy, setBusy] = useState('');

    const { data: plansData, loading: loadingPlans } = useCachedResource('billing:plans', () => api.getPlans());
    const { data: histData, loading: loadingHist, refresh: refreshHist } = useCachedResource('billing:history', () => api.billingHistory());
    const { data: subData, refresh: refreshSub } = useCachedResource('billing:subscription', () => api.getSubscription());

    const plans = plansData?.plans || [];
    const stripeEnabled = plansData?.stripeEnabled;
    const invoices = histData?.invoices || [];
    const subscription = subData?.subscription || null;
    const current = user?.plan || 'free';
    const usage = user?.usage;
    const hasSub = invoices.length > 0 || current !== 'free';

    // Retorno do checkout
    useEffect(() => {
        const c = params.get('checkout');
        if (!c) return;
        if (c === 'success') { toast.show('Pagamento concluído! Atualizando seu plano…'); refreshUser(); refreshHist(); refreshSub(); }
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
    const daysLeft = subscription?.currentPeriodEnd
        ? Math.max(0, Math.ceil((subscription.currentPeriodEnd - Date.now()) / 86400000)) : null;

    return (
        <div className="page" style={{ maxWidth: 980 }}>
            <div className="page-head">
                <h1>{t('Assinatura')}</h1>
                <p>{t('Gerencie seu plano, uso e pagamentos.')}</p>
            </div>

            {/* Resumo do plano atual + uso */}
            <div className="card fade-in" style={{ marginBottom: 18 }}>
                <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div className="kpi-ico" style={{ width: 44, height: 44, fontSize: 22 }}><i className="ti ti-crown" /></div>
                    <div>
                        <div className="muted" style={{ fontSize: 12 }}>{t('Plano atual')}</div>
                        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' }}>
                                {plans.find((p) => p.id === current)?.label || current}
                            </div>
                            {subscription && <span className={`badge ${SUB_BADGE[subscription.status] || 'neutral'}`}>{t(SUB_LABEL[subscription.status] || subscription.status)}</span>}
                        </div>
                        {subscription?.currentPeriodEnd && (
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                {subscription.cancelAtPeriodEnd
                                    ? <><i className="ti ti-calendar-x" /> {t('cancela em')} {fmtDate(subscription.currentPeriodEnd)} {t('(acesso até lá)')}</>
                                    : <><i className="ti ti-calendar-repeat" /> {t('renova em')} {fmtDate(subscription.currentPeriodEnd)}</>}
                                {daysLeft != null && <> · <b>{daysLeft}</b> {t(daysLeft === 1 ? 'dia restante' : 'dias restantes')} <span style={{ opacity: 0.7 }}>{t('(ciclo de 1 mês)')}</span></>}
                            </div>
                        )}
                    </div>
                    <div className="spacer" />
                    {hasSub && stripeEnabled && (
                        <button className="btn" disabled={busy === 'portal'} onClick={manage}>
                            <i className="ti ti-settings" /> {busy === 'portal' ? t('Abrindo…') : t('Gerenciar / Cancelar')}
                        </button>
                    )}
                </div>
                {usage && (
                    <div style={{ marginTop: 18 }}>
                        <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                            <span className="muted">{t('Envios hoje')}</span>
                            <span className="mono"><b>{usage.usedToday}</b> / {usage.dailyLimit}</span>
                        </div>
                        <div className="progress"><span style={{ width: `${pct}%` }} /></div>
                        <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{usage.remainingToday} {t('envios restantes hoje.')}</div>
                    </div>
                )}
            </div>

            {/* Planos */}
            {!stripeEnabled && <div className="notice danger"><i className="ti ti-alert-circle" />{t('Pagamentos não configurados no servidor.')}</div>}
            <div className="cards-grid" style={{ marginBottom: 22 }}>
                {loadingPlans
                    ? [0, 1, 2].map((i) => <div key={i} className="skeleton sk-card" />)
                    : plans.map((p, i) => {
                        const isCurrent = p.id === current;
                        const featured = !!p.popular;
                        return (
                            <div key={p.id} className={`card plan-card fade-in d${i + 1} ${featured ? 'plan-featured' : ''}`}
                                style={!featured && isCurrent ? { borderColor: 'var(--color-accent)' } : undefined}>
                                <div className="row" style={{ alignItems: 'center' }}>
                                    <span className="plan-tag">{p.label}</span>
                                    {isCurrent && <span className="badge ok" style={{ marginLeft: 'auto' }}>{t('atual')}</span>}
                                    {!isCurrent && featured && <span className="badge info" style={{ marginLeft: 'auto' }}>{t('mais popular')}</span>}
                                </div>
                                <div className="plan-price-row">
                                    <span className="plan-price-v">{p.price ? `R$${p.price}` : 'R$0'}</span>
                                    <span className="plan-price-p">{p.period}</span>
                                </div>
                                <ul className="plan-feat-list">
                                    {(p.features || []).map((f) => <li key={f}><i className="ti ti-check" />{f}</li>)}
                                </ul>
                                {isCurrent ? (
                                    <button className="btn block sm" disabled>{t('Plano atual')}</button>
                                ) : current !== 'free' ? (
                                    // Já tem assinatura paga → trocar pelo portal do Stripe (evita 2ª assinatura).
                                    <button className="btn block sm" disabled={busy === 'portal' || !stripeEnabled} onClick={manage}>
                                        {busy === 'portal' ? t('Abrindo…') : (<><i className="ti ti-arrows-exchange" /> {p.id === 'free' ? t('Cancelar / downgrade') : t('Trocar para {plan}', { plan: p.label })}</>)}
                                    </button>
                                ) : p.purchasable ? (
                                    <button className="btn primary block sm" disabled={!!busy || !stripeEnabled} onClick={() => upgrade(p.id)}>
                                        {busy === p.id ? t('Redirecionando…') : (<><i className="ti ti-arrow-up-circle" /> {t('Assinar {plan}', { plan: p.label })}</>)}
                                    </button>
                                ) : (
                                    <button className="btn block sm" disabled>{p.id === 'free' ? t('Plano grátis') : t('Indisponível')}</button>
                                )}
                            </div>
                        );
                    })}
            </div>

            {/* Histórico de pagamentos */}
            <div className="card fade-in">
                <div className="section-title"><i className="ti ti-receipt" /> {t('Histórico de pagamentos')}</div>
                {loadingHist ? (
                    <div className="inv-grid">{[0, 1].map((i) => <div key={i} className="skeleton sk-card" style={{ height: 70 }} />)}</div>
                ) : invoices.length === 0 ? (
                    <div className="empty" style={{ padding: 28 }}><i className="ti ti-receipt-off" />{t('Nenhum pagamento ainda.')}</div>
                ) : (
                    <div className="inv-grid">
                        {invoices.map((inv) => (
                            <div key={inv.id} className="inv-card">
                                <div className="inv-ico"><i className="ti ti-receipt" /></div>
                                <div className="inv-main">
                                    <div className="inv-amount">{money(inv.amount, inv.currency)}</div>
                                    <div className="muted" style={{ fontSize: 12 }}>{fmtDate(inv.date)}</div>
                                </div>
                                <span className={`badge ${inv.status === 'paid' ? 'ok' : 'neutral'}`}>{inv.status === 'paid' ? t('pago') : inv.status}</span>
                                {inv.url && <a className="btn ghost sm" href={inv.url} target="_blank" rel="noopener" title="Ver fatura"><i className="ti ti-external-link" /></a>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
