import { config } from '../config.js';
import { createCircuitBreaker } from '../lib/circuitBreaker.js';

// =========================
// Pré-análise de conteúdo com IA (Groq) — classifica + extrai dados de vagas.
// Tem circuit breaker: se a API falhar/travar repetidas vezes, abre o circuito
// e o chamador cai no fallback (regex do scraper), sem queimar créditos.
// =========================

const breaker = createCircuitBreaker({ threshold: 3, cooldownMs: 120000 });
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

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

export function aiState() {
    return { enabled: config.ai.enabled, model: config.ai.model, ...breaker.state() };
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

/**
 * Analisa um texto. Retorna o objeto normalizado, ou null se IA desativada/
 * circuito aberto/erro (o chamador deve usar o fallback nesse caso).
 */
export async function analyzeContent(text) {
    if (!config.ai.enabled || breaker.isOpen()) return null;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
    try {
        const res = await fetch(GROQ_URL, {
            method: 'POST',
            headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: config.ai.model,
                temperature: 0,
                response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: buildPrompt(text) }],
            }),
            signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
        const data = await res.json();
        const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
        breaker.recordSuccess();
        return normalize(parsed);
    } catch (e) {
        breaker.recordFailure();
        console.warn('IA (Groq) falhou:', e.message, '→ fallback');
        return null;
    } finally {
        clearTimeout(timer);
    }
}
