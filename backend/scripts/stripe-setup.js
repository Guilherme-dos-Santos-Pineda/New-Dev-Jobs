import 'dotenv/config';
import { stripe, stripeConfigured } from '../services/stripeClient.js';
import { PLANS } from '../config/plans.js';

// Cria (1x) os Produtos + Preços recorrentes no Stripe e imprime os price IDs
// para colar no .env (STRIPE_PRICE_STARTER / STRIPE_PRICE_PRO).
// Idempotente: reaproveita produto existente com metadata.plan igual.
// Uso: node backend/scripts/stripe-setup.js

if (!stripeConfigured) {
    console.error('❌ STRIPE_SECRET_KEY ausente no .env');
    process.exit(1);
}

// Preços mensais em centavos (ajuste à vontade).
const PRICING = { starter: 2900, pro: 9900 };
const CURRENCY = process.env.STRIPE_CURRENCY || 'brl';

async function findProduct(plan) {
    const list = await stripe.products.list({ active: true, limit: 100 });
    return list.data.find((p) => p.metadata?.plan === plan) || null;
}

async function findPrice(productId, plan) {
    const list = await stripe.prices.list({ product: productId, active: true, limit: 100 });
    return list.data.find((p) => p.recurring && p.metadata?.plan === plan) || null;
}

for (const plan of ['starter', 'pro']) {
    const label = PLANS[plan].label;
    let product = await findProduct(plan);
    if (!product) {
        product = await stripe.products.create({ name: `newdevjobs ${label}`, metadata: { plan } });
        console.log(`+ produto criado: ${product.id} (${label})`);
    } else {
        console.log(`= produto existente: ${product.id} (${label})`);
    }

    let price = await findPrice(product.id, plan);
    if (!price) {
        price = await stripe.prices.create({
            product: product.id,
            currency: CURRENCY,
            unit_amount: PRICING[plan],
            recurring: { interval: 'month' },
            metadata: { plan },
        });
        console.log(`+ preço criado: ${price.id}`);
    } else {
        console.log(`= preço existente: ${price.id}`);
    }
    console.log(`→ STRIPE_PRICE_${plan.toUpperCase()}=${price.id}\n`);
}

console.log('✅ Cole os STRIPE_PRICE_* acima no .env e reinicie o backend.');
process.exit(0);
