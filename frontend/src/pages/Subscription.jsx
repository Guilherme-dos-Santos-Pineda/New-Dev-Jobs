import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';

const money = (cents, currency = 'brl') =>
    ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: (currency || 'brl').toUpperCase() });
const fmtDate = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateTime = (ms) => {
    const d = new Date(ms);
    return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const SUB_BADGE = { active: 'ok', trialing: 'info', past_due: 'danger', unpaid: 'danger', canceled: 'neutral' };
const SUB_LABEL = { active: 'ativa', trialing: 'teste', past_due: 'pagamento pendente', unpaid: 'não paga', canceled: 'cancelada' };

// Status de fatura do Stripe → rótulo + tom do badge.
const INV_STATUS = {
    paid: { label: 'Pago', cls: 'ok', kind: 'approved' },
    open: { label: 'Pendente', cls: 'warn', kind: 'pending' },
    draft: { label: 'Rascunho', cls: 'neutral', kind: 'pending' },
    void: { label: 'Cancelado', cls: 'neutral', kind: 'other' },
    uncollectible: { label: 'Não paga', cls: 'danger', kind: 'other' },
};
const invStatus = (s) => INV_STATUS[s] || { label: s || '—', cls: 'neutral', kind: 'other' };
const METHOD_LABEL = { card: 'Cartão', pix: 'PIX', boleto: 'Boleto' };
const PROVIDER_LABEL = { stripe: 'Stripe', woovi: 'Woovi' };

export default function Subscription() {
    const { user, refreshUser } = useAuth();
    const { t } = useT();
    const toast = useToast();
    const [params, setParams] = useSearchParams();
    const [busy, setBusy] = useState('');

    // Filtros do histórico
    const [fStatus, setFStatus] = useState('all');
    const [fMethod, setFMethod] = useState('all');
    const [fPeriod, setFPeriod] = useState('all');
    const [query, setQuery] = useState('');
    const [histOpen, setHistOpen] = useState(false); // histórico minimizado por padrão (planos em destaque)

    const { data: plansData, loading: loadingPlans } = useCachedResource('billing:plans', () => api.getPlans());
    const { data: histData, loading: loadingHist, refresh: refreshHist } = useCachedResource('billing:history', () => api.billingHistory());
    const { data: subData, refresh: refreshSub } = useCachedResource('billing:subscription', () => api.getSubscription());

    const plans = plansData?.plans || [];
    const stripeEnabled = plansData?.stripeEnabled;
    const invoices = histData?.invoices || [];
    const subscription = subData?.subscription || null;
    const current = user?.plan || 'free';
    const usage = user?.usage;
    const planExpiresAt = user?.planExpiresAt || null; // pagamento único: validade do plano
    const planLabel = (id) => plans.find((p) => p.id === id)?.label || (id ? id : '—');
    const currentPlan = plans.find((p) => p.id === current);

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

    // Estatísticas (sobre todo o histórico, independem dos filtros)
    const stats = useMemo(() => {
        let approved = 0, pending = 0, totalPaid = 0;
        for (const i of invoices) {
            const k = invStatus(i.status).kind;
            if (k === 'approved') { approved++; totalPaid += i.amount || 0; }
            else if (k === 'pending') pending++;
        }
        return { total: invoices.length, approved, pending, totalPaid };
    }, [invoices]);

    // Faturas filtradas (status / método / período / busca)
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const now = Date.now();
        const periodMs = { '30': 30, '90': 90, '365': 365 }[fPeriod];
        return invoices.filter((i) => {
            if (fStatus !== 'all' && i.status !== fStatus) return false;
            if (fMethod !== 'all' && (i.method || 'card') !== fMethod) return false;
            if (periodMs && (now - i.date) / 86400000 > periodMs) return false;
            if (q) {
                const hay = `${i.id} ${money(i.amount, i.currency)} ${(i.amount || 0) / 100}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [invoices, fStatus, fMethod, fPeriod, query]);

    const pct = usage ? Math.min(100, Math.round((usage.usedToday / Math.max(1, usage.dailyLimit)) * 100)) : 0;
    const daysLeft = subscription?.currentPeriodEnd
        ? Math.max(0, Math.ceil((subscription.currentPeriodEnd - Date.now()) / 86400000)) : null;
    const expDaysLeft = planExpiresAt ? Math.max(0, Math.ceil((planExpiresAt - Date.now()) / 86400000)) : null;
    const currentPurchasable = currentPlan?.purchasable;
    const currentPrice = currentPlan?.price || 0; // só permite upgrade (preço maior); sem downgrade
    const hasFilter = fStatus !== 'all' || fMethod !== 'all' || fPeriod !== 'all' || !!query.trim();

    return (
        <div className="page" style={{ maxWidth: 1080 }}>
            <div className="page-head">
                <h1>{t('Assinatura e pagamentos')}</h1>
                <p>{t('Gerencie seu plano e veja todo o histórico de pagamentos.')}</p>
            </div>

            {/* Resumo do plano atual + uso */}
            <div className="card fade-in" style={{ marginBottom: 18 }}>
                <div className="row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                    <div className="kpi-ico" style={{ width: 44, height: 44, fontSize: 22 }}><i className="ti ti-crown" /></div>
                    <div>
                        <div className="muted" style={{ fontSize: 12 }}>{t('Plano atual')}</div>
                        <div className="row" style={{ alignItems: 'center', gap: 8 }}>
                            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.5px' }}>
                                {currentPlan?.label || current}
                            </div>
                            {subscription && <span className={`badge ${SUB_BADGE[subscription.status] || 'neutral'}`}>{t(SUB_LABEL[subscription.status] || subscription.status)}</span>}
                            {expDaysLeft != null && (
                                <span className={`badge ${expDaysLeft <= 3 ? 'danger' : expDaysLeft <= 7 ? 'warn' : 'ok'}`} style={{ fontSize: 12 }}>
                                    <i className="ti ti-clock-hour-4" /> {expDaysLeft === 0 ? t('expira hoje') : <><b>{expDaysLeft}</b> {t(expDaysLeft === 1 ? 'dia restante' : 'dias restantes')}</>}
                                </span>
                            )}
                        </div>
                        {planExpiresAt ? (
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                <i className="ti ti-calendar-check" /> {t('acesso até')} {fmtDate(planExpiresAt)}
                                {expDaysLeft != null && <> · <b>{expDaysLeft}</b> {t(expDaysLeft === 1 ? 'dia restante' : 'dias restantes')}</>}
                            </div>
                        ) : subscription?.currentPeriodEnd ? (
                            <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                                {subscription.cancelAtPeriodEnd
                                    ? <><i className="ti ti-calendar-x" /> {t('cancela em')} {fmtDate(subscription.currentPeriodEnd)} {t('(acesso até lá)')}</>
                                    : <><i className="ti ti-calendar-repeat" /> {t('renova em')} {fmtDate(subscription.currentPeriodEnd)}</>}
                                {daysLeft != null && <> · <b>{daysLeft}</b> {t(daysLeft === 1 ? 'dia restante' : 'dias restantes')}</>}
                            </div>
                        ) : null}
                    </div>
                    <div className="spacer" />
                    {planExpiresAt && stripeEnabled && currentPurchasable && (
                        <button className="btn primary" disabled={!!busy} onClick={() => upgrade(current)}>
                            <i className="ti ti-refresh" /> {busy === current ? t('Redirecionando…') : t('Renovar {plan}', { plan: currentPlan?.label || current })}
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

            {/* Histórico de pagamentos */}
            <div className="card fade-in" style={{ marginBottom: 22 }}>
                <div className="row hist-head" onClick={() => setHistOpen((o) => !o)} style={{ alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                    <div className="section-title" style={{ margin: 0 }}><i className="ti ti-receipt" /> {t('Histórico de pagamentos')}</div>
                    {invoices.length > 0 && <span className="badge neutral">{invoices.length}</span>}
                    <div className="spacer" />
                    {invoices.length > 0 && <span className="muted" style={{ fontSize: 12.5 }}>{money(stats.totalPaid)} {t('pago')}</span>}
                    <i className={`ti ti-chevron-${histOpen ? 'up' : 'down'} hist-chevron`} style={{ fontSize: 18, color: 'var(--color-text-tertiary)' }} />
                </div>

                {histOpen && (<div style={{ marginTop: 14 }}>
                <div className="row" style={{ justifyContent: 'flex-end', marginBottom: 12 }}>
                    <button className="btn ghost sm" onClick={refreshHist} title={t('Atualizar')}><i className="ti ti-refresh" /> {t('Atualizar')}</button>
                </div>

                {/* Estatísticas */}
                <div className="pay-stats">
                    <div className="pay-stat">
                        <div className="ps-l"><i className="ti ti-list-numbers" /> {t('Total de pagamentos')}</div>
                        <div className="ps-v">{stats.total}</div>
                    </div>
                    <div className="pay-stat ok">
                        <div className="ps-l"><i className="ti ti-circle-check" /> {t('Aprovados')}</div>
                        <div className="ps-v">{stats.approved}</div>
                    </div>
                    <div className="pay-stat warn">
                        <div className="ps-l"><i className="ti ti-clock" /> {t('Pendentes')}</div>
                        <div className="ps-v">{stats.pending}</div>
                    </div>
                    <div className="pay-stat">
                        <div className="ps-l"><i className="ti ti-cash" /> {t('Total pago')}</div>
                        <div className="ps-v">{money(stats.totalPaid)}</div>
                    </div>
                </div>

                {/* Filtros */}
                <div className="pay-filters">
                    <div className="f-field">
                        <label>{t('Status')}</label>
                        <select className="select" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                            <option value="all">{t('Todos')}</option>
                            <option value="paid">{t('Pago')}</option>
                            <option value="open">{t('Pendente')}</option>
                            <option value="void">{t('Cancelado')}</option>
                        </select>
                    </div>
                    <div className="f-field">
                        <label>{t('Método')}</label>
                        <select className="select" value={fMethod} onChange={(e) => setFMethod(e.target.value)}>
                            <option value="all">{t('Todos')}</option>
                            <option value="card">{t('Cartão')}</option>
                        </select>
                    </div>
                    <div className="f-field">
                        <label>{t('Período')}</label>
                        <select className="select" value={fPeriod} onChange={(e) => setFPeriod(e.target.value)}>
                            <option value="all">{t('Todo o período')}</option>
                            <option value="30">{t('Últimos 30 dias')}</option>
                            <option value="90">{t('Últimos 90 dias')}</option>
                            <option value="365">{t('Últimos 12 meses')}</option>
                        </select>
                    </div>
                    <div className="f-field f-grow">
                        <label>{t('Buscar')}</label>
                        <input className="input" value={query} onChange={(e) => setQuery(e.target.value)}
                            placeholder={t('ID da transação ou valor…')} />
                    </div>
                </div>

                {/* Tabela */}
                {loadingHist ? (
                    <div className="inv-grid">{[0, 1].map((i) => <div key={i} className="skeleton sk-card" style={{ height: 70 }} />)}</div>
                ) : invoices.length === 0 ? (
                    <div className="empty" style={{ padding: 28 }}><i className="ti ti-receipt-off" />{t('Nenhum pagamento ainda.')}</div>
                ) : (
                    <div className="pay-table-wrap">
                        <table className="pay-table">
                            <thead>
                                <tr>
                                    <th>{t('ID da Transação')}</th><th>{t('Data do Pagamento')}</th><th>{t('Valor')}</th>
                                    <th>{t('Método')}</th><th>{t('Status')}</th><th>{t('Plano')}</th><th>{t('Provedor')}</th><th>{t('Ações')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 ? (
                                    <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 24 }}>{t('Nenhum pagamento para os filtros.')}</td></tr>
                                ) : filtered.map((i) => {
                                    const st = invStatus(i.status);
                                    return (
                                        <tr key={i.id}>
                                            <td className="mono pay-id" title={i.id}>{i.id}</td>
                                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(i.date)}</td>
                                            <td className="mono" style={{ whiteSpace: 'nowrap' }}>{money(i.amount, i.currency)}</td>
                                            <td>{METHOD_LABEL[i.method] || t('Cartão')}</td>
                                            <td><span className={`badge ${st.cls}`}>{t(st.label)}</span></td>
                                            <td>{planLabel(i.plan)}</td>
                                            <td>{PROVIDER_LABEL[i.provider] || '—'}</td>
                                            <td>
                                                {i.url || i.pdf ? (
                                                    <div className="row" style={{ gap: 6 }}>
                                                        {i.url && <a className="btn ghost sm" href={i.url} target="_blank" rel="noopener" title={t('Ver fatura')}><i className="ti ti-external-link" /></a>}
                                                        {i.pdf && <a className="btn ghost sm" href={i.pdf} target="_blank" rel="noopener" title={t('Baixar PDF')}><i className="ti ti-download" /></a>}
                                                    </div>
                                                ) : <span className="muted">—</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {hasFilter && invoices.length > 0 && (
                    <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>
                        {t('Mostrando {n} de {total}', { n: filtered.length, total: invoices.length })}
                    </div>
                )}
                </div>)}
            </div>

            {/* Planos */}
            <div className="section-title" style={{ marginBottom: 4 }}><i className="ti ti-rocket" /> {t('Planos')}</div>
            <p className="muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 16 }}>
                {t('Automatize suas candidaturas e ganhe tempo. Faça upgrade quando precisar de mais.')}
            </p>
            {!stripeEnabled && <div className="notice danger"><i className="ti ti-alert-circle" />{t('Pagamentos não configurados no servidor.')}</div>}
            <div className="cards-grid" style={{ marginBottom: 18 }}>
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
                                {p.desc && <div className="plan-desc">{p.desc}</div>}
                                <div className="plan-price-row">
                                    <span className="plan-price-v">{p.price ? `R$${p.price}` : 'R$0'}</span>
                                    <span className="plan-price-p">{p.period}</span>
                                </div>
                                {p.price > 0 && <div className="plan-note"><i className="ti ti-calendar-check" /> {t('pagamento único · acesso por 30 dias')}</div>}
                                <ul className="plan-feat-list">
                                    {(p.features || []).map((f) => <li key={f}><i className="ti ti-check" />{f}</li>)}
                                </ul>
                                {isCurrent ? (
                                    <button className="btn block sm" disabled>{t('Plano atual')}</button>
                                ) : p.purchasable && p.price > currentPrice ? (
                                    <button className="btn primary block sm" disabled={!!busy || !stripeEnabled} onClick={() => upgrade(p.id)}>
                                        {busy === p.id ? t('Redirecionando…') : (<><i className="ti ti-arrow-up-circle" /> {t('Fazer upgrade')}</>)}
                                    </button>
                                ) : (
                                    <button className="btn block sm" disabled>{p.id === 'free' ? t('Plano grátis') : t('Incluído no seu plano')}</button>
                                )}
                            </div>
                        );
                    })}
            </div>

            {/* Rodapé: plano atual + contato */}
            <div className="sub-foot">
                <span className="muted">
                    {t('Seu plano atual')}: <b style={{ color: 'var(--color-text)' }}>{currentPlan?.label || current}</b>
                    {currentPlan?.price ? <> · {money(currentPlan.price * 100)} <span style={{ opacity: 0.7 }}>({t('30 dias')})</span></> : <> · {t('grátis')}</>}
                </span>
                <div className="spacer" />
                <span className="muted">
                    {t('Precisa de um plano personalizado?')}{' '}
                    <a href="mailto:newdevoficial@gmail.com" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{t('Fale com o suporte')}</a>
                </span>
            </div>
        </div>
    );
}
