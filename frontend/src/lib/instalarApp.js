// App instalável (PWA): registro do service worker e o "Instalar app" do menu.
//
// O Chrome dispara `beforeinstallprompt` UMA vez, logo depois de carregar. Se
// ninguém estiver ouvindo nessa hora, o evento se perde e o botão nunca aparece.
// Por isso o listener nasce em `registrarApp()`, chamado no main.jsx, e não no
// componente do menu (que só monta quando a pessoa abre o menu).
//
// Não chamamos preventDefault: a faixa "Instalar" do próprio Chrome continua
// aparecendo, e é ela que a maioria das pessoas vai ver.
import { useEffect, useState } from 'react';

let adiado = null;
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());

export function registrarApp() {
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => { adiado = e; avisar(); });
    window.addEventListener('appinstalled', () => { adiado = null; avisar(); });

    // Só no build: no dev server o SW guardaria módulos do Vite e atrapalharia o HMR.
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
        });
    }
}

function jaInstalado() {
    return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// O iOS não tem prompt de instalação: só dá para ensinar o caminho pelo Compartilhar.
function ehIOS() {
    const ua = window.navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
}

export function useInstalarApp() {
    const [, setVersao] = useState(0);
    useEffect(() => {
        const f = () => setVersao((v) => v + 1);
        ouvintes.add(f);
        return () => { ouvintes.delete(f); };
    }, []);

    const ios = ehIOS();
    return {
        mostrar: !jaInstalado() && (!!adiado || ios),
        ios,
        // true se instalou; false se a pessoa recusou ou o navegador não deixou.
        instalar: async () => {
            if (!adiado) return false;
            try {
                await adiado.prompt();
                const { outcome } = await adiado.userChoice;
                adiado = null;
                avisar();
                return outcome === 'accepted';
            } catch {
                return false;
            }
        },
    };
}
