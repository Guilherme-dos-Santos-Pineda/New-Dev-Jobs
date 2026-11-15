import { api } from '../api.js';

// =========================
// De onde a pessoa veio (backend/services/indicacao.js)
// =========================
// A landing grava a PRIMEIRA visita no navegador (mesmo domínio, mesmo
// localStorage). Aqui o app faz o mesmo para quem chega direto em /signup?ref=...,
// e manda uma vez depois do login. Sem cookie e sem IP: só o canal e o código.
const CHAVE = 'origem';
const CHAVE_REF = 'ref';
const ENVIADA = 'origemEnviada';

function ler(k) { try { return localStorage.getItem(k); } catch { return null; } }
function gravar(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento: segue sem origem */ } }

export function capturarOrigem() {
    try {
        const q = new URLSearchParams(location.search);
        const ref = q.get('ref');
        if (ref) gravar(CHAVE_REF, ref.slice(0, 12));
        if (ler(CHAVE)) return;
        gravar(CHAVE, JSON.stringify({
            utm_source: q.get('utm_source') || undefined,
            utm_medium: q.get('utm_medium') || undefined,
            utm_campaign: q.get('utm_campaign') || undefined,
            ref: ref || undefined,
            referrer: document.referrer || undefined,
            pagina: location.pathname,
            em: new Date().toISOString(),
        }));
    } catch { /* URL estranha: sem origem */ }
}

/** Depois do login, uma vez por navegador. O servidor ignora conta antiga. */
export function enviarOrigem() {
    if (ler(ENVIADA)) return;
    let origem = null;
    try { origem = JSON.parse(ler(CHAVE) || 'null'); } catch { /* corrompido */ }
    const ref = ler(CHAVE_REF) || origem?.ref || undefined;
    gravar(ENVIADA, '1');
    api.enviarOrigem({ origem: origem || { pagina: location.pathname }, ref }).catch(() => {});
}
