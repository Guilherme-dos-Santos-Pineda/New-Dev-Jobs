import 'dotenv/config';
import { runDiscovery, runMonitoring } from './backend/services/scraper.js';

// CLI do scraper. Uso:
//   npm run scrape                 → monitoramento (recrutadores aprovados)
//   node scraper.js --mode=discovery   → descoberta de recrutadores
// A lógica vive em backend/services/scraper.js (reutilizada pelo worker/admin).

const arg = process.argv.find((a) => a.startsWith('--mode='));
const mode = (arg ? arg.split('=')[1] : 'monitoring');

(async () => {
    console.log(`🕷️  Scraper — modo: ${mode}`);
    const stats = mode === 'discovery' ? await runDiscovery({}) : await runMonitoring({});
    console.log('✅ Resultado:', JSON.stringify(stats));
    process.exit(0);
})().catch((e) => {
    console.error('❌ Scraper falhou:', e.message);
    process.exit(1);
});
