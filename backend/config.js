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
    // IA — pré-análise do scraper (cadeia de provedores com fallback)
    GROQ_API_KEY = '',
    GROQ_MODEL = 'llama-3.3-70b-versatile',
    OPENAI_API_KEY = '',
    OPENAI_MODEL = 'gpt-4o-mini',
    AI_PROVIDER_ORDER = 'groq,openai', // ordem de tentativa; cai para o próximo quando um falha
    AI_ENABLED = 'true',
    AI_MIN_CONFIDENCE = '70',
    AI_MAX_CALLS_PER_RUN = '40',
    AI_TIMEOUT_MS = '15000',
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
    ai: {
        // Provedores configurados (com chave). A cadeia tenta na ordem de `order`.
        providers: {
            groq: {
                apiKey: GROQ_API_KEY,
                model: GROQ_MODEL,
                baseUrl: 'https://api.groq.com/openai/v1/chat/completions',
                configured: Boolean(GROQ_API_KEY),
            },
            openai: {
                apiKey: OPENAI_API_KEY,
                model: OPENAI_MODEL,
                baseUrl: 'https://api.openai.com/v1/chat/completions',
                configured: Boolean(OPENAI_API_KEY),
            },
        },
        // Ordem de tentativa, só com provedores que têm chave (default groq→openai).
        order: AI_PROVIDER_ORDER.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean),
        enabled: AI_ENABLED !== 'false' && Boolean(GROQ_API_KEY || OPENAI_API_KEY),
        // compat: alguns lugares ainda leem config.ai.model (provedor primário)
        model: GROQ_MODEL,
        minConfidence: Number(AI_MIN_CONFIDENCE) || 70,
        maxCallsPerRun: Number(AI_MAX_CALLS_PER_RUN) || 40,
        timeoutMs: Number(AI_TIMEOUT_MS) || 15000,
    },
    adminEmails,
    // Se nenhum ADMIN_EMAILS configurado, libera admin em dev (auth é mock).
    isAdminEmail: (email) => adminEmails.length === 0 || adminEmails.includes((email || '').toLowerCase()),
};

if (!googleConfigured) {
    console.warn('⚠️  Google OAuth não configurado — rodando em modo MOCK de email. Veja backend/SETUP_GOOGLE.md');
}
