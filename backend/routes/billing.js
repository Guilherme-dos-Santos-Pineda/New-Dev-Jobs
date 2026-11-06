import { Router } from 'express';
import { z } from 'zod';
import sql from '../lib/sql.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { PLANS } from '../config/plans.js';
import { PLANOS_PAGOS_ATIVOS, compraLiberada } from '../config/planosPagos.js';
import { planUsage } from '../services/usage.js';
import { stripe, stripeConfigured, planFromPriceId } from '../services/stripeClient.js';
import { itemDeCheckout, mapCharge, computeExpiry, decideCheckoutSession } from '../services/billingLogic.js';

// =========================
// Comércio / planos (Fase 5+6) — Stripe real
// =========================
// O plano vive em Users.Plan (free|starter|pro). Checkout cria assinatura no
// Stripe; o webhook (assinado) atualiza Users.Plan automaticamente.

const router = Router();

// GET /api/billing/plans — catálogo público (tela de preços/upgrade)
// Com os planos pagos desligados (config/planosPagos.js) o catálogo só tem o
// grátis: a tela não tem o que oferecer e a landing deixa de mostrar preço.
const catalogo = (liberado) => ({
    stripeEnabled: stripeConfigured && liberado,
    pagosAtivos: liberado,
    plans: Object.entries(PLANS).filter(([id, p]) => (liberado || id === 'free') && p.aVenda !== false).map(([id, p]) => ({
        id, label: p.label, dailyLimit: p.dailyLimit, allowManual: p.allowManual, priority: p.priority,
        price: p.price, period: p.period, popular: p.popular, desc: p.desc, features: p.features,
        purchasable: id !== 'free',
    })),
});

router.get('/plans', (_req, res) => res.json(catalogo(PLANOS_PAGOS_ATIVOS)));

// GET /api/billing/catalogo — o mesmo catálogo, do ponto de vista de quem está logado
router.get('/catalogo', requireAuth, (req, res) => res.json(catalogo(compraLiberada(req.user.Email))));

// GET /api/billing/me — plano + uso diário do usuário atual
router.get('/me', requireAuth, async (req, res) => {
    res.json({ usage: await planUsage(req.user.Id, req.user.Plan) });
});

// POST /api/billing/checkout  { plan } — cria a sessão de checkout (assinatura)
const checkoutSchema = z.object({ plan: z.enum(['starter']) });
router.post('/checkout', requireAuth, validate(checkoutSchema), async (req, res) => {
    // A trava é aqui, não só no botão: com a chave desligada ninguém compra,
    // nem chamando a API direto.
    if (!compraLiberada(req.user.Email)) return res.status(403).json({ error: 'Os planos pagos estão desativados. Tudo é grátis por enquanto.' });
    if (!stripeConfigured) return res.status(503).json({ error: 'Pagamentos indisponíveis no momento.' });

    try {
        // Pagamento único: libera 30 dias, sem renovação automática.
        const meta = { userId: req.user.Id, plan: req.body.plan };
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [itemDeCheckout(PLANS[req.body.plan])],
            client_reference_id: req.user.Id,
            customer_email: req.user.Email,
            metadata: meta,
            payment_intent_data: { metadata: meta },
            customer_creation: 'always',
            success_url: `${config.frontendUrl}/app/assinatura?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${config.frontendUrl}/app/assinatura?checkout=cancel`,
        });
        res.json({ url: session.url });
    } catch (e) {
        console.error('Erro no checkout Stripe:', e.message);
        res.status(502).json({ error: 'Falha ao iniciar o checkout.' });
    }
});

// GET /api/billing/history — pagamentos do usuário (charges cobrem pagamento único
// E assinatura; invoice.list ficaria vazio no avulso). Mapeamento em billingLogic.
router.get('/history', requireAuth, async (req, res) => {
    if (!stripeConfigured) return res.json({ invoices: [] });
    const [u] = await sql`select "StripeCustomerId" from "Users" where "Id" = ${req.user.Id}`;
    if (!u?.StripeCustomerId) return res.json({ invoices: [] });
    try {
        const list = await stripe.charges.list({ customer: u.StripeCustomerId, limit: 20, expand: ['data.payment_intent'] });
        res.json({ invoices: list.data.map(mapCharge) });
    } catch (e) {
        console.error('Erro ao listar pagamentos:', e.message);
        res.json({ invoices: [] });
    }
});

// GET /api/billing/subscription — status/renovação da assinatura atual (Stripe)
router.get('/subscription', requireAuth, async (req, res) => {
    if (!stripeConfigured) return res.json({ subscription: null });
    const [u] = await sql`select "StripeSubscriptionId" from "Users" where "Id" = ${req.user.Id}`;
    if (!u?.StripeSubscriptionId) return res.json({ subscription: null });
    try {
        const sub = await stripe.subscriptions.retrieve(u.StripeSubscriptionId);
        res.json({
            subscription: {
                status: sub.status, // active | trialing | past_due | canceled | unpaid…
                currentPeriodEnd: sub.current_period_end ? sub.current_period_end * 1000 : null,
                cancelAtPeriodEnd: !!sub.cancel_at_period_end,
                plan: planFromPriceId(sub.items?.data?.[0]?.price?.id),
            },
        });
    } catch (e) {
        console.error('Erro ao buscar assinatura:', e.message);
        res.json({ subscription: null });
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
// Assinatura gerencia o próprio ciclo → zera PlanExpiresAt (usado só no avulso).
async function applySubscription({ userId, plan, customerId, subscriptionId }) {
    if (!userId || !plan) return;
    await sql`
        update "Users" set
            "Plan" = ${plan},
            "StripeCustomerId" = coalesce(${customerId || null}, "StripeCustomerId"),
            "StripeSubscriptionId" = ${subscriptionId || null},
            "PlanExpiresAt" = null
        where "Id" = ${userId}`;
    console.log(`💳 plano atualizado via Stripe: user ${userId} → ${plan}`);
}

// Concede um plano pago por N dias (pagamento ÚNICO). A nova validade é calculada
// em JS (computeExpiry — empilha sobre o tempo restante se ainda ativo) para ser a
// mesma lógica coberta pelos testes.
async function grantOneTime({ userId, plan, customerId, days = 30 }) {
    if (!userId || !plan) return;
    const [u] = await sql`select "PlanExpiresAt" from "Users" where "Id" = ${userId}`;
    const currentMs = u?.PlanExpiresAt ? new Date(u.PlanExpiresAt).getTime() : null;
    const expiresAt = new Date(computeExpiry(currentMs, days));
    // Cada compra gera um cliente novo na Stripe. A mesma compra chega por dois
    // caminhos (webhook e volta do checkout), e o where impede somar 60 dias.
    const aplicado = await sql`
        update "Users" set
            "Plan" = ${plan},
            "StripeCustomerId" = coalesce(${customerId || null}, "StripeCustomerId"),
            "StripeSubscriptionId" = null,
            "PlanExpiresAt" = ${expiresAt}
        where "Id" = ${userId} and "StripeCustomerId" is distinct from ${customerId || null}
        returning "Id"`;
    if (!aplicado.length) return;
    console.log(`💳 pagamento único: user ${userId} → ${plan} por ${days} dias (até ${expiresAt.toISOString()})`);
}

// POST /api/billing/confirmar  { sessionId } — a volta do checkout confere o
// pagamento direto na Stripe. É a segunda via do webhook: se ele falhar, quem pagou
// recebe o plano do mesmo jeito. Só vale para a sessão da própria pessoa.
const confirmarSchema = z.object({ sessionId: z.string().min(10).max(255) });
router.post('/confirmar', requireAuth, validate(confirmarSchema), async (req, res) => {
    if (!stripeConfigured) return res.status(503).json({ error: 'Pagamentos indisponíveis no momento.' });
    try {
        const s = await stripe.checkout.sessions.retrieve(req.body.sessionId);
        const decisao = decideCheckoutSession(s);
        if (decisao.action !== 'grant' || decisao.userId !== req.user.Id) return res.json({ concedido: false });
        await grantOneTime({ userId: decisao.userId, plan: decisao.plan, customerId: s.customer, days: decisao.days });
        res.json({ concedido: true });
    } catch (e) {
        console.error('Erro ao confirmar pagamento:', e.message);
        res.status(400).json({ error: 'Não deu para confirmar o pagamento.' });
    }
});

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
                const decision = decideCheckoutSession(s);
                if (decision.action === 'grant') {
                    // Pagamento único aprovado → concede os dias de acesso.
                    await grantOneTime({ userId: decision.userId, plan: decision.plan, customerId: s.customer, days: decision.days });
                } else if (decision.action === 'subscribe') {
                    // Assinatura (legado): plano do metadata ou do price da subscription.
                    let plan = decision.plan;
                    if (!plan && s.subscription) {
                        const sub = await stripe.subscriptions.retrieve(s.subscription);
                        plan = planFromPriceId(sub.items.data[0]?.price?.id);
                    }
                    await applySubscription({ userId: decision.userId, plan, customerId: s.customer, subscriptionId: s.subscription });
                }
                // action === 'ignore' → pagamento não concluído, nada a fazer.
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
