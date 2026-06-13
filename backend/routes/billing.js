import { Router } from 'express';
import { z } from 'zod';
import sql from '../lib/sql.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PLANS } from '../config/plans.js';
import { planUsage } from '../services/usage.js';
import { stripe, stripeConfigured, planFromPriceId, priceIdForPlan } from '../services/stripeClient.js';

// =========================
// Comércio / planos (Fase 5+6) — Stripe real
// =========================
// O plano vive em Users.Plan (free|starter|pro). Checkout cria assinatura no
// Stripe; o webhook (assinado) atualiza Users.Plan automaticamente.

const router = Router();

// GET /api/billing/plans — catálogo público (tela de preços/upgrade)
router.get('/plans', (_req, res) => {
    res.json({
        stripeEnabled: stripeConfigured,
        plans: Object.entries(PLANS).map(([id, p]) => ({
            id, label: p.label, dailyLimit: p.dailyLimit, allowManual: p.allowManual, priority: p.priority,
            purchasable: id !== 'free' && Boolean(priceIdForPlan(id)),
        })),
    });
});

// GET /api/billing/me — plano + uso diário do usuário atual
router.get('/me', requireAuth, async (req, res) => {
    res.json({ usage: await planUsage(req.user.Id, req.user.Plan) });
});

// POST /api/billing/checkout  { plan } — cria a sessão de checkout (assinatura)
const checkoutSchema = z.object({ plan: z.enum(['starter', 'pro']) });
router.post('/checkout', requireAuth, validate(checkoutSchema), async (req, res) => {
    if (!stripeConfigured) return res.status(503).json({ error: 'Pagamentos indisponíveis no momento.' });
    const price = priceIdForPlan(req.body.plan);
    if (!price) return res.status(503).json({ error: `Preço do plano ${req.body.plan} não configurado (STRIPE_PRICE_*).` });

    try {
        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price, quantity: 1 }],
            client_reference_id: req.user.Id,
            customer_email: req.user.Email,
            metadata: { userId: req.user.Id, plan: req.body.plan },
            subscription_data: { metadata: { userId: req.user.Id, plan: req.body.plan } },
            success_url: `${config.frontendUrl}/app/perfil?checkout=success`,
            cancel_url: `${config.frontendUrl}/app/perfil?checkout=cancel`,
        });
        res.json({ url: session.url });
    } catch (e) {
        console.error('Erro no checkout Stripe:', e.message);
        res.status(502).json({ error: 'Falha ao iniciar o checkout.' });
    }
});

// GET /api/billing/history — faturas do Stripe do usuário
router.get('/history', requireAuth, async (req, res) => {
    if (!stripeConfigured) return res.json({ invoices: [] });
    const [u] = await sql`select "StripeCustomerId" from "Users" where "Id" = ${req.user.Id}`;
    if (!u?.StripeCustomerId) return res.json({ invoices: [] });
    try {
        const list = await stripe.invoices.list({ customer: u.StripeCustomerId, limit: 12 });
        res.json({
            invoices: list.data.map((i) => ({
                id: i.id, amount: i.amount_paid, currency: i.currency, status: i.status,
                date: i.created * 1000, url: i.hosted_invoice_url, pdf: i.invoice_pdf,
            })),
        });
    } catch (e) {
        console.error('Erro ao listar faturas:', e.message);
        res.json({ invoices: [] });
    }
});

// POST /api/billing/portal — sessão do Stripe Billing Portal (gerenciar/cancelar)
router.post('/portal', requireAuth, async (req, res) => {
    if (!stripeConfigured) return res.status(503).json({ error: 'Pagamentos indisponíveis no momento.' });
    const [u] = await sql`select "StripeCustomerId" from "Users" where "Id" = ${req.user.Id}`;
    if (!u?.StripeCustomerId) return res.status(400).json({ error: 'Nenhuma assinatura ativa para gerenciar.' });
    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: u.StripeCustomerId,
            return_url: `${config.frontendUrl}/app/assinatura`,
        });
        res.json({ url: session.url });
    } catch (e) {
        console.error('Erro no billing portal:', e.message);
        res.status(502).json({ error: 'Portal de cobrança indisponível (configure-o no Stripe).' });
    }
});

// POST /api/billing/set-plan  { plan, userId? } — troca de plano manual (ADMIN/suporte)
const setPlanSchema = z.object({ plan: z.enum(['free', 'starter', 'pro']), userId: z.string().uuid().optional() });
router.post('/set-plan', requireAdmin, validate(setPlanSchema), async (req, res) => {
    const target = req.body.userId || req.user.Id;
    const updated = await sql`update "Users" set "Plan" = ${req.body.plan} where "Id" = ${target} returning "Id"`;
    if (!updated.length) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ ok: true, userId: target, plan: req.body.plan });
});

// Aplica o plano a partir de uma assinatura do Stripe (usado pelo webhook).
async function applySubscription({ userId, plan, customerId, subscriptionId }) {
    if (!userId || !plan) return;
    await sql`
        update "Users" set
            "Plan" = ${plan},
            "StripeCustomerId" = coalesce(${customerId || null}, "StripeCustomerId"),
            "StripeSubscriptionId" = ${subscriptionId || null}
        where "Id" = ${userId}`;
    console.log(`💳 plano atualizado via Stripe: user ${userId} → ${plan}`);
}

// POST /api/billing/webhook — recebe eventos do Stripe (corpo CRU via express.raw no server.js)
router.post('/webhook', async (req, res) => {
    if (!stripeConfigured || !config.stripe.webhookSecret) {
        return res.status(503).json({ error: 'Webhook não configurado' });
    }
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], config.stripe.webhookSecret);
    } catch (e) {
        console.error('Assinatura do webhook inválida:', e.message);
        return res.status(400).json({ error: `Webhook signature: ${e.message}` });
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const s = event.data.object;
                const userId = s.client_reference_id || s.metadata?.userId;
                // plano: do metadata; senão tenta pelo price da subscription expandida
                let plan = s.metadata?.plan;
                if (!plan && s.subscription) {
                    const sub = await stripe.subscriptions.retrieve(s.subscription);
                    plan = planFromPriceId(sub.items.data[0]?.price?.id);
                }
                await applySubscription({ userId, plan, customerId: s.customer, subscriptionId: s.subscription });
                break;
            }
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const userId = sub.metadata?.userId;
                const active = ['active', 'trialing'].includes(sub.status);
                const plan = active ? planFromPriceId(sub.items.data[0]?.price?.id) : 'free';
                await applySubscription({ userId, plan, customerId: sub.customer, subscriptionId: sub.id });
                break;
            }
            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const userId = sub.metadata?.userId;
                await applySubscription({ userId, plan: 'free', customerId: sub.customer, subscriptionId: null });
                break;
            }
            default:
                break; // ignora os demais
        }
        res.json({ received: true });
    } catch (e) {
        console.error('Erro ao processar webhook:', e.message);
        res.status(500).json({ error: 'Erro ao processar o evento' });
    }
});

export default router;
