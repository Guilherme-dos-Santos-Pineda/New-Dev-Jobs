import 'dotenv/config';

const {
    GOOGLE_CLIENT_ID = '',
    GOOGLE_CLIENT_SECRET = '',
    GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/auth/google/callback',
    FRONTEND_URL = 'http://localhost:5173',
    PORT = '3001',
    EMAIL_MODE = '', // 'mock' força o modo simulado mesmo com credenciais
    ADMIN_EMAILS = '', // emails (separados por vírgula) com acesso de admin
    // Apify (scraper)
    APIFY_TOKEN = '',
    APIFY_PROFILE_ACTOR_ID = '', // LinkedIn Profile Search Scraper (descoberta)
    APIFY_POST_ACTOR_ID = 'buIWk2uOUzTmcLsuB', // LinkedIn Post Search Scraper (monitoramento)
    // Stripe (billing)
    STRIPE_SECRET_KEY = '',
    STRIPE_WEBHOOK_SECRET = '',
    STRIPE_PRICE_STARTER = '',
    STRIPE_PRICE_PRO = '',
} = process.env;

const adminEmails = ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

// Integração real só fica ativa se houver Client ID + Secret.
const googleConfigured = Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);

// Envio real via Gmail só quando configurado e não forçado a mock.
const emailMode = EMAIL_MODE === 'mock' || !googleConfigured ? 'mock' : 'gmail';

export const config = {
    port: Number(PORT),
    frontendUrl: FRONTEND_URL,
    google: {
        clientId: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        redirectUri: GOOGLE_REDIRECT_URI,
        configured: googleConfigured,
        // gmail.send: enviar em nome do usuário; openid/email: identificar a conta
        scopes: [
            'https://www.googleapis.com/auth/gmail.send',
            'openid',
            'email',
            'profile',
        ],
    },
    emailMode, // 'gmail' | 'mock'
    apify: {
        token: APIFY_TOKEN,
        profileActorId: APIFY_PROFILE_ACTOR_ID,
        postActorId: APIFY_POST_ACTOR_ID,
        configured: Boolean(APIFY_TOKEN),
    },
    stripe: {
        secretKey: STRIPE_SECRET_KEY,
        webhookSecret: STRIPE_WEBHOOK_SECRET,
        prices: { starter: STRIPE_PRICE_STARTER, pro: STRIPE_PRICE_PRO },
        configured: Boolean(STRIPE_SECRET_KEY),
    },
    adminEmails,
    // Se nenhum ADMIN_EMAILS configurado, libera admin em dev (auth é mock).
    isAdminEmail: (email) => adminEmails.length === 0 || adminEmails.includes((email || '').toLowerCase()),
};

if (!googleConfigured) {
    console.warn('⚠️  Google OAuth não configurado — rodando em modo MOCK de email. Veja backend/SETUP_GOOGLE.md');
}
