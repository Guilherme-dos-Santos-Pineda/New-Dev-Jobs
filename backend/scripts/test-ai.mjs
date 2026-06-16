import 'dotenv/config';
import { config } from '../config.js';
import { analyzeContent } from '../services/ai.js';

// =========================================================================
// Testa a cadeia de IA: chama CADA provedor configurado isoladamente sobre um
// post de exemplo e mostra latência + classificação. Serve para confirmar que
// Groq e OpenAI estão respondendo (e que o fallback funciona).
//
// Uso:  node backend/scripts/test-ai.mjs ["texto do post opcional"]
// =========================================================================

const SAMPLE = process.argv[2] || `Estamos contratando! 🚀
Vaga: Pessoa Desenvolvedora Backend Pleno (Node.js)
Modalidade: Remoto (Brasil) · CLT
Stack: Node.js, PostgreSQL, Docker, AWS.
Interessados, enviem o currículo para vagas@empresa.com.br`;

console.log('Ordem configurada (AI_PROVIDER_ORDER):', config.ai.order.join(' → '));
const configured = config.ai.order.filter((n) => config.ai.providers[n]?.configured);
const missing = config.ai.order.filter((n) => !config.ai.providers[n]?.configured);
if (missing.length) console.log('Sem chave (serão pulados):', missing.join(', '));
if (!configured.length) { console.error('❌ Nenhum provedor com chave. Configure GROQ_API_KEY e/ou OPENAI_API_KEY no .env.'); process.exit(1); }

const originalOrder = config.ai.order;
for (const name of configured) {
    config.ai.order = [name]; // força só este provedor
    const t0 = Date.now();
    const r = await analyzeContent(SAMPLE);
    const ms = Date.now() - t0;
    if (!r) { console.log(`\n❌ ${name} (${config.ai.providers[name].model}) — falhou/sem resposta (${ms}ms)`); continue; }
    console.log(`\n✅ ${name} (${config.ai.providers[name].model}) — ${ms}ms`);
    console.log(`   isJob=${r.isJob} confidence=${r.confidence} cargo=${r.cargo || '—'} email=${r.email || '—'}`);
    console.log(`   senioridade=${r.senioridade || '—'} modalidade=${r.modalidade || '—'} techs=[${r.tecnologias.join(', ')}]`);
}
config.ai.order = originalOrder;
console.log('\nPronto. Se algum falhou, confira a chave/limite do provedor.');
process.exit(0);
