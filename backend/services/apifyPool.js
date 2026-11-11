import { ApifyClient } from 'apify-client';
import { config } from '../config.js';

// =========================================================================
// Pool de contas Apify com rotação/fallback do crédito grátis (~$5/mês por conta).
// Roda um actor consumindo UMA conta por vez; quando o crédito de uma esgota
// (erro de cota da Apify), marca como esgotada até a virada do mês e passa para a
// próxima. Análogo à cadeia de fallback da IA. Estado em memória (reseta no deploy;
// a exaustão é redetectada na 1ª chamada e há reset manual no admin).
// =========================================================================

const accounts = config.apify.tokens.map((token, i) => ({
    label: `Conta ${i + 1}`,
    token,
    exhaustedUntil: 0, // ms epoch; 0 = saudável
    lastError: null,
    lastUsedAt: null,
    calls: 0,
}));

// 1º dia do próximo mês em UTC — quando o crédito grátis da Apify renova.
export function endOfMonthMs(now = Date.now()) {
    const d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

// Erro de crédito/cota da Apify (definitivo p/ a conta) vs. transitório (rede/5xx).
export function isQuotaError(e) {
    const status = e?.statusCode || e?.status;
    if (status === 402 || status === 403) return true;
    const msg = String(e?.message || '').toLowerCase();
    return /usage|exceeded|\blimit|credit|quota|insufficient|monthly|payment required/.test(msg);
}

/**
 * Chave recusada pela Apify (401): a conta trocou ou revogou o token. Em 11/11/2026
 * a conta 2 passou a responder 401 depois de um aviso de troca de chaves. Sem isto
 * o erro subia como transitório: a execução falhava em vez de passar para a
 * próxima conta, e o pg-boss repetia na mesma chave morta.
 */
export function isAuthError(e) {
    const status = e?.statusCode || e?.status;
    if (status === 401) return true;
    return /token is not valid|authentication token|user was not found|unauthorized/i.test(String(e?.message || ''));
}

function healthyAccounts(now = Date.now()) {
    return accounts.filter((a) => a.token && a.exhaustedUntil <= now);
}

/**
 * Quando (ms epoch) a primeira conta volta a ter crédito — ou 0 se já existe uma
 * conta utilizável agora. Deixa o AGENDADOR perguntar antes de enfileirar: sem
 * isto ele reivindica robôs, grava em "ScraperRuns" e enfileira execuções que
 * morrem 3s depois no `runActor`, de minuto em minuto, 24h por dia.
 * Retorna 0 também quando não há NENHUMA conta configurada: aí o problema é de
 * configuração e o erro deve aparecer, não ser silenciado como "sem crédito".
 */
export function apifyExhaustedUntil(now = Date.now()) {
    const withToken = accounts.filter((a) => a.token);
    if (!withToken.length) return 0;
    if (withToken.some((a) => a.exhaustedUntil <= now)) return 0;
    return Math.min(...withToken.map((a) => a.exhaustedUntil));
}

/**
 * Roda um actor da Apify com fallback entre contas. Só rotaciona em erro de CRÉDITO;
 * erro transitório sobe para o retry do pg-boss. @returns { items, account }.
 */
export async function runActor(actorId, input) {
    const pool = healthyAccounts();
    if (!pool.length) {
        throw new Error(accounts.length
            ? 'Todas as contas Apify estão sem crédito este mês — aguarde a virada do mês ou faça reset no admin.'
            : 'Nenhuma conta Apify configurada (defina APIFY_TOKEN).');
    }
    const errs = [];
    for (const acct of pool) {
        try {
            const client = new ApifyClient({ token: acct.token });
            const run = await client.actor(actorId).call(input);
            const ds = await client.dataset(run.defaultDatasetId).listItems();
            acct.lastUsedAt = Date.now();
            acct.calls += 1;
            acct.lastError = null;
            return { items: ds.items, account: acct.label };
        } catch (e) {
            if (isAuthError(e)) {
                // Até o próximo deploy ou o reset no admin: trocar a chave exige mexer no .env e reiniciar.
                acct.exhaustedUntil = endOfMonthMs();
                acct.lastError = 'chave inválida (401): gere uma nova na Apify e troque no .env';
                errs.push(acct.label);
                console.warn(`⤷ Apify ${acct.label} com chave inválida, passando para a próxima conta`);
                continue;
            }
            if (isQuotaError(e)) {
                acct.exhaustedUntil = endOfMonthMs();
                acct.lastError = `crédito esgotado: ${String(e.message || '').slice(0, 120)}`;
                errs.push(acct.label);
                console.warn(`⤷ Apify ${acct.label} sem crédito — rotacionando para a próxima conta`);
                continue;
            }
            throw e; // rede/5xx/actor → transitório: deixa o pg-boss retentar
        }
    }
    throw new Error(`Apify: todas as contas disponíveis esgotaram o crédito (${errs.join(', ')}).`);
}

// Estado mascarado para o admin (nunca expõe o token inteiro).
export function apifyPoolState() {
    const now = Date.now();
    return {
        total: accounts.length,
        healthy: accounts.filter((a) => a.exhaustedUntil <= now).length,
        accounts: accounts.map((a) => ({
            label: a.label,
            tokenHint: a.token ? `…${a.token.slice(-4)}` : '—',
            exhausted: a.exhaustedUntil > now,
            resetsAt: a.exhaustedUntil > now ? a.exhaustedUntil : null,
            lastUsedAt: a.lastUsedAt,
            calls: a.calls,
            lastError: a.lastError,
        })),
    };
}

// Reset manual (admin): limpa as marcações de esgotado (virou o mês, troquei a conta…).
export function resetApifyPool() {
    for (const a of accounts) { a.exhaustedUntil = 0; a.lastError = null; }
    return apifyPoolState();
}

/**
 * Sobra crédito acima de `minimo`? Robô extra pergunta isto antes de gastar, para
 * nunca tirar o crédito do monitoramento. Na dúvida (conta que não respondeu),
 * diz não: perder uma busca extra custa menos que parar o robô principal.
 */
export function temFolgaDeCredito(uso, minimo) {
    if (!uso?.accounts?.length || uso.accounts.some((a) => a.remainingUsd == null)) return false;
    return uso.accounts.reduce((soma, a) => soma + a.remainingUsd, 0) >= minimo;
}

// Gasto REAL do mês por conta (via API da Apify), para o relatório de custos.
// Cacheado 60s (é 1 chamada de rede por conta). Free tier = US$5/conta/mês.
const FREE_USD = 5;
let usageCache = { at: 0, data: null };
export async function apifyUsage() {
    if (usageCache.data && Date.now() - usageCache.at < 60000) return usageCache.data;
    const out = [];
    for (const a of accounts) {
        let usedUsd = null, error = null;
        try {
            const mu = await new ApifyClient({ token: a.token }).user().monthlyUsage();
            usedUsd = Number(mu?.totalUsageCreditsUsdAfterVolumeDiscount ?? 0);
        } catch (e) { error = String(e.message || 'erro').slice(0, 60); }
        out.push({
            label: a.label, tokenHint: a.token ? `…${a.token.slice(-4)}` : '—',
            usedUsd, freeUsd: FREE_USD,
            remainingUsd: usedUsd == null ? null : Math.max(0, FREE_USD - usedUsd),
            error,
        });
    }
    const totalUsed = out.reduce((s, x) => s + (x.usedUsd || 0), 0);
    const totalFree = accounts.length * FREE_USD;
    const data = { accounts: out, totalUsed, totalFree, totalRemaining: Math.max(0, totalFree - totalUsed) };
    usageCache = { at: Date.now(), data };
    return data;
}
