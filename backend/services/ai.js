import { config } from '../config.js';
import { createCircuitBreaker } from '../lib/circuitBreaker.js';

// =========================
// Pré-análise de conteúdo com IA — classifica + extrai dados de vagas.
// Cadeia de provedores (default: Groq → OpenAI). Ambos falam a API compatível
// com OpenAI (/chat/completions, response_format json_object), então o caller é
// genérico, só muda baseUrl/apiKey/model. Cada provedor tem seu próprio circuit
// breaker: se um falha/trava repetidas vezes, o circuito abre e a cadeia pula
// para o próximo. Se todos falharem, retorna null → caller usa o fallback regex.
// =========================

// Um circuit breaker por provedor (isola falhas: Groq cair não abre o da OpenAI).
const breakers = {
    groq: createCircuitBreaker({ threshold: 3, cooldownMs: 120000 }),
    openai: createCircuitBreaker({ threshold: 3, cooldownMs: 120000 }),
};

const SYSTEM = 'Você classifica posts do LinkedIn para um agregador de vagas de tecnologia. Responda SOMENTE com JSON válido, sem texto extra.';

function buildPrompt(text) {
    return `Analise o conteúdo e devolva JSON com EXATAMENTE estas chaves:
{
 "isJob": boolean,           // descreve uma vaga de emprego REAL?
 "isRecruiter": boolean,     // o autor é recrutador/RH?
 "isCompany": boolean,
 "isAd": boolean,            // propaganda, curso ou serviço
 "isGeneric": boolean,       // post motivacional/genérico, sem vaga
 "hasEmail": boolean,
 "cargo": string|null,
 "empresa": string|null,
 "senioridade": string|null, // um de: estagio, junior, pleno, senior, lead
 "modalidade": string|null,  // um de: remoto, hibrido, presencial
 "localizacao": string|null,
 "tecnologias": string[],
 "email": string|null,
 "linkedin": string|null,
 "salario": string|null,
 "beneficios": string|null,
 "confidence": number        // 0-100: confiança de que "isJob" está correto
}
Conteúdo:
"""${(text || '').slice(0, 4000)}"""`;
}

// Provedores na ordem configurada, só os que têm chave (e existem em breakers).
function activeProviders() {
    return config.ai.order
        .map((name) => ({ name, cfg: config.ai.providers[name] }))
        .filter((p) => p.cfg?.configured && breakers[p.name]);
}

export function aiState() {
    const providers = activeProviders().map(({ name, cfg }) => ({
        name, model: cfg.model, ...breakers[name].state(),
    }));
    const primary = providers[0] || { open: false, openUntil: 0, failures: 0 };
    // Mantém as chaves de topo que o admin/observabilidade já consome.
    return {
        enabled: config.ai.enabled,
        model: primary.model || config.ai.model,
        order: config.ai.order,
        open: primary.open, openUntil: primary.openUntil, failures: primary.failures,
        providers,
    };
}

function normalize(p) {
    const str = (v) => (v && String(v).trim() ? String(v).trim() : null);
    return {
        isJob: !!p.isJob, isRecruiter: !!p.isRecruiter, isCompany: !!p.isCompany,
        isAd: !!p.isAd, isGeneric: !!p.isGeneric, hasEmail: !!p.hasEmail,
        cargo: str(p.cargo), empresa: str(p.empresa), senioridade: str(p.senioridade),
        modalidade: str(p.modalidade), localizacao: str(p.localizacao),
        tecnologias: Array.isArray(p.tecnologias) ? p.tecnologias.map(String).slice(0, 20) : [],
        email: str(p.email), linkedin: str(p.linkedin), salario: str(p.salario), beneficios: str(p.beneficios),
        confidence: Math.max(0, Math.min(100, Math.round(Number(p.confidence) || 0))),
    };
}

// Uma chamada a um provedor (API compatível com OpenAI). Retorna o objeto
// normalizado ou lança (para a cadeia tentar o próximo).
async function callProvider({ name, cfg }, text) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
    try {
        const res = await fetch(cfg.baseUrl, {
            method: 'POST',
            headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: cfg.model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: buildPrompt(text) }],
            }),
            signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
        const data = await res.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        breakers[name].recordSuccess();
        return normalize(parsed);
    } catch (e) {
        breakers[name].recordFailure();
        throw e;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Analisa um texto pela cadeia de provedores (na ordem configurada).
 * Retorna o objeto normalizado do primeiro que responder, ou null se a IA
 * está desativada / todos os provedores falharam ou estão com o circuito aberto.
 */
export async function analyzeContent(text) {
    if (!config.ai.enabled) return null;

    const providers = activeProviders().filter((p) => !breakers[p.name].isOpen());
    for (const provider of providers) {
        try {
            return await callProvider(provider, text);
        } catch (e) {
            console.warn(`IA (${provider.name}) falhou:`, e.message, '→ próximo provedor/fallback');
            // segue para o próximo provedor da cadeia
        }
    }
    return null;
}
