// Service worker do app instalável (PWA). Servido em /app/sw.js, então o escopo
// é /app/: a landing e o /api nunca passam por aqui.
//
// O que ele faz, e só isso:
//   - Navegação (abrir/recarregar uma tela): REDE PRIMEIRO. Cada deploy chega na
//     hora; a cópia guardada do index.html só é usada sem internet, para o app
//     abrir mostrando a própria tela em vez do dinossauro do Chrome.
//   - /app/assets/*: CACHE PRIMEIRO. O nome tem hash do conteúdo, então o arquivo
//     guardado nunca fica velho.
//   - Todo o resto (manifest, ícones) vai direto para a rede.
//
// SE UM DIA ELE ATRAPALHAR: troque este arquivo por um que só faça
// `self.registration.unregister()` no activate. O navegador confere o sw.js a
// cada navegação, sem cache HTTP, e o desliga em todo aparelho no próximo acesso.

const SHELL = 'ndj-shell-v1';
const ASSETS = 'ndj-assets-v1';
const INDEX = '/app/index.html';
// Assets de deploys antigos se acumulam; guarda só os mais recentes.
const MAX_ASSETS = 80;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const nomes = await caches.keys();
        await Promise.all(nomes.filter((n) => n !== SHELL && n !== ASSETS).map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

async function aparar(cache) {
    const chaves = await cache.keys();
    for (const k of chaves.slice(0, Math.max(0, chaves.length - MAX_ASSETS))) await cache.delete(k);
}

async function navegacao(request) {
    try {
        const resp = await fetch(request);
        // Só guarda a shell de verdade: um 404/500 guardado viraria a tela offline.
        if (resp.ok && (resp.headers.get('content-type') || '').includes('text/html')) {
            const cache = await caches.open(SHELL);
            await cache.put(INDEX, resp.clone());
        }
        return resp;
    } catch (err) {
        const guardada = await caches.match(INDEX);
        if (guardada) return guardada;
        throw err;
    }
}

async function asset(request) {
    const guardado = await caches.match(request);
    if (guardado) return guardado;
    const resp = await fetch(request);
    if (resp.ok) {
        const cache = await caches.open(ASSETS);
        await cache.put(request, resp.clone());
        aparar(cache);
    }
    return resp;
}

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(navegacao(request));
    } else if (url.pathname.startsWith('/app/assets/')) {
        event.respondWith(asset(request));
    }
});
