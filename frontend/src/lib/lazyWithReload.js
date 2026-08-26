import { lazy } from 'react';

// Um deploy troca os nomes dos chunks (hash no nome) e apaga os antigos. Uma aba
// aberta desde ANTES do deploy ainda tem o index.html velho em memória, então ao
// navegar ela pede um arquivo que já não existe. O import() rejeita, e o
// <Suspense> do React fica preso no fallback PARA SEMPRE — sem erro na tela, só
// um spinner eterno. Sintoma péssimo de diagnosticar: parece servidor fora do ar.
//
// Aqui o import falho recarrega a página uma vez, o que busca o index.html novo
// (o nginx serve HTML com no-cache) e, com ele, os nomes de chunk corretos.
//
// A trava em sessionStorage impede loop: se logo após um reload o import falhar
// de novo, o problema não é chunk velho — é uma falha real (rede, arquivo
// ausente no servidor). Aí o erro sobe em vez de recarregar sem parar.
const FLAG = 'chunkReloadAttempted';

/** Marca que o app carregou inteiro; chamado no boot para liberar a trava. */
export function clearChunkReloadFlag() {
    try { sessionStorage.removeItem(FLAG); } catch { /* modo privado */ }
}

export default function lazyWithReload(factory) {
    return lazy(() =>
        factory().catch((err) => {
            let jaTentou = true;
            try {
                jaTentou = sessionStorage.getItem(FLAG) === '1';
                if (!jaTentou) sessionStorage.setItem(FLAG, '1');
            } catch {
                // Sem sessionStorage não dá para detectar repetição com segurança;
                // não recarrega, para não arriscar um loop infinito.
                throw err;
            }
            if (jaTentou) throw err;

            window.location.reload();
            // Promise que nunca resolve: segura o Suspense no fallback durante o
            // reload, em vez de piscar uma tela de erro que vai sumir num instante.
            return new Promise(() => {});
        }),
    );
}
