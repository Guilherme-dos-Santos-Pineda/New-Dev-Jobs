import Stripe from 'stripe';
import { config } from '../config.js';

// Cliente Stripe (null se STRIPE_SECRET_KEY ausente — billing fica desabilitado).
export const stripeConfigured = config.stripe.configured;
export const stripe = stripeConfigured ? new Stripe(config.stripe.secretKey) : null;

// Mapa price_id → plano (para o webhook). Construído a partir das envs.
export function planFromPriceId(priceId) {
    const { prices } = config.stripe;
    if (priceId && priceId === prices.starter) return 'starter';
    if (priceId && priceId === prices.pro) return 'pro';
    return null;
}

// Mapa plano → price_id (para o checkout).
export function priceIdForPlan(plan) {
    return config.stripe.prices[plan] || null;
}
