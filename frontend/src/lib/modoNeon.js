// =========================
// Modo Neon (easter egg)
// =========================
// Tema secreto: noite de praia nos anos 80, roxo, rosa e ciano, pôr do sol
// listrado, grade no chão e coqueiros. Pedido do dono (25/11/2026), inspirado no
// clima de cidade praiana neon. É um clima, não uma cópia: nada de nome, logo,
// fonte ou personagem de jogo nenhum (marca alheia num produto pago é problema).
//
// Como ligar: digitar "neon" em qualquer tela fora de um campo de texto, ou tocar
// 7 vezes seguidas na marca (celular). O mesmo gesto desliga. Fica no
// localStorage('modoNeon'), e o script do <head> aplica antes do render, senão
// pisca no tema normal. Não mexe em 'theme': desligar volta ao tema de antes.

const CHAVE = 'modoNeon';
const FONTE = 'https://fonts.googleapis.com/css2?family=Monoton&family=Righteous&display=swap';

export const neonLigado = () => document.documentElement.classList.contains('neon');

function carregarFonte() {
    if (document.getElementById('fonte-neon')) return;
    const l = document.createElement('link');
    l.id = 'fonte-neon'; l.rel = 'stylesheet'; l.href = FONTE;
    document.head.appendChild(l);
}

export function ligarNeon(ligar) {
    document.documentElement.classList.toggle('neon', ligar);
    try { ligar ? localStorage.setItem(CHAVE, '1') : localStorage.removeItem(CHAVE); } catch { /* aba anônima */ }
    if (ligar) carregarFonte();
    window.dispatchEvent(new CustomEvent('modo-neon', { detail: ligar }));
}

const alternar = () => ligarNeon(!neonLigado());

// Toques na marca: 7 em menos de 3 s.
let toques = [];
export function toqueNaMarca() {
    const agora = Date.now();
    toques = toques.filter((t) => agora - t < 3000).concat(agora);
    if (toques.length >= 7) { toques = []; alternar(); }
}

// Digitar "neon" fora de campo de texto.
export function escutarSegredo() {
    if (neonLigado()) carregarFonte();
    let buffer = '';
    window.addEventListener('keydown', (e) => {
        const alvo = e.target;
        if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return;
        if (e.key.length !== 1) return;
        buffer = (buffer + e.key.toLowerCase()).slice(-4);
        if (buffer === 'neon') { buffer = ''; alternar(); }
    });
}
