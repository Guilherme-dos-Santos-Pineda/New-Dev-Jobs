import { api } from '../api.js';

// =========================
// Notificação no celular (Web Push), do lado do navegador
// =========================
// O servidor (backend/services/push.js) manda; o service worker (public/sw.js)
// mostra. Aqui: pedir a permissão (só com clique, senão o navegador bloqueia),
// inscrever este aparelho e cancelar. No iPhone o push só existe com o app
// adicionado à tela de início (iOS 16.4+): fora disso `PushManager` nem existe.

export function suportado() {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function permissao() {
    return suportado() ? Notification.permission : 'unsupported';
}

/** iPhone fora do app instalado: dá para avisar que precisa instalar antes. */
export function iphoneSemApp() {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
    const instalado = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
    return ios && !instalado;
}

function chaveEmBytes(base64) {
    const pad = '='.repeat((4 - (base64.length % 4)) % 4);
    const b = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

async function registro() {
    // O app registra o sw.js no build (instalarApp.js); aqui só espera ele ficar pronto.
    // Sem service worker (dev server, registro que falhou) o ready nunca resolve: corta em 8 s.
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, falha) => setTimeout(() => falha(new Error('O app ainda não terminou de carregar. Tente de novo em instantes.')), 8000)),
    ]);
}

/** Este aparelho já está inscrito? */
export async function inscritoAqui() {
    if (!suportado() || Notification.permission !== 'granted') return false;
    try { return !!(await (await registro()).pushManager.getSubscription()); } catch { return false; }
}

/** Pede a permissão e inscreve este aparelho. Chame só dentro de um clique. */
export async function ativar(chave) {
    if (!suportado()) throw new Error('Este navegador não recebe notificações.');
    if (!chave) throw new Error('As notificações ainda não estão disponíveis.');
    const p = await Notification.requestPermission();
    if (p !== 'granted') throw new Error('Você não permitiu as notificações. Dá para liberar nas configurações do navegador.');
    const reg = await registro();
    const sub = (await reg.pushManager.getSubscription())
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveEmBytes(chave) });
    await api.pushInscrever(sub.toJSON());
    return true;
}

export async function desativar() {
    if (!suportado()) return;
    const sub = await (await registro()).pushManager.getSubscription();
    if (!sub) return;
    await api.pushCancelar(sub.endpoint).catch(() => {});
    await sub.unsubscribe().catch(() => {});
}
