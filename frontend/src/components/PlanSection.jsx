import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useToast } from '../components/Toast.jsx';

export default function PlanSection() {
    const { user } = useAuth();
    const toast = useToast();
    const [plans, setPlans] = useState([]);
    const [stripeEnabled, setStripeEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const { plans, stripeEnabled } = await api.getPlans();
                setPlans(plans);
                setStripeEnabled(stripeEnabled);
            } catch (e) { toast.show(e.message, 'error'); }
            finally { setLoading(false); }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    async function upgrade(planId) {
        setBusy(planId);
        try {
            const { url } = await api.checkout(planId);
            window.location.href = url; // redireciona ao Stripe Checkout
        } catch (e) {
            toast.show(e.message, 'error');
            setBusy('');
        }
    }

    if (loading) return <div className="card center" style={{ padding: 40 }}><div className="spinner" /></div>;

    const current = user?.plan || 'free';
    const usage = user?.usage;

    return (
        <div className="card">
            <div className="sec-card-head"><h2><i className="ti ti-crown" /> Plano &amp; Cobrança</h2></div>
            <div className="why"><i className="ti ti-info-circle" />Seu plano define o limite diário de envios e o acesso à seleção manual de vagas.</div>

            {usage && (
                <div className="notice info" style={{ marginBottom: 16 }}>
                    <i className="ti ti-gauge" />
                    <span>Plano atual: <b>{plans.find((p) => p.id === current)?.label || current}</b> · hoje você enviou <b>{usage.usedToday}</b> de <b>{usage.dailyLimit}</b> ({usage.remainingToday} restantes).</span>
                </div>
            )}

            {!stripeEnabled && (
                <div className="notice danger" style={{ marginBottom: 16 }}><i className="ti ti-alert-circle" />Pagamentos não configurados no servidor (STRIPE_*).</div>
            )}

            <div className="grid-2" style={{ gap: 14 }}>
                {plans.map((p) => {
                    const isCurrent = p.id === current;
                    return (
                        <div key={p.id} className="card" style={{ borderColor: isCurrent ? 'var(--color-accent)' : 'var(--color-border-light)' }}>
                            <div className="row" style={{ alignItems: 'center' }}>
                                <strong style={{ fontSize: 15 }}>{p.label}</strong>
                                {isCurrent && <span className="badge ok" style={{ marginLeft: 'auto' }}>atual</span>}
                            </div>
                            <ul style={{ margin: '10px 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.8, color: 'var(--color-text-secondary)' }}>
                                <li><b>{p.dailyLimit}</b> envios/dia</li>
                                <li>{p.allowManual ? 'Seleção manual de vagas' : 'Envio automático'}</li>
                            </ul>
                            {isCurrent ? (
                                <button className="btn block sm" disabled>Plano atual</button>
                            ) : p.purchasable ? (
                                <button className="btn primary block sm" disabled={!!busy || !stripeEnabled} onClick={() => upgrade(p.id)}>
                                    {busy === p.id ? 'Redirecionando…' : (<><i className="ti ti-arrow-up-circle" /> Fazer upgrade</>)}
                                </button>
                            ) : (
                                <button className="btn block sm" disabled>{p.id === 'free' ? 'Plano grátis' : 'Indisponível'}</button>
                            )}
                        </div>
                    );
                })}
            </div>

            <p className="muted" style={{ fontSize: 11.5, marginTop: 14 }}>
                Pagamento processado pela Stripe. Você será redirecionado para concluir a assinatura.
            </p>
        </div>
    );
}
