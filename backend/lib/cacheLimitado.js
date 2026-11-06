/** Guarda buffers até `maxBytes`. Passou disso, sai o que foi usado há mais tempo. */
export function criarCacheLimitado(maxBytes) {
    const itens = new Map(); // o Map mantém a ordem: o primeiro é o mais antigo
    let total = 0;

    function apagar(chave) {
        const atual = itens.get(chave);
        if (!atual) return;
        total -= atual.length;
        itens.delete(chave);
    }

    return {
        apagar,
        ler(chave) {
            const atual = itens.get(chave);
            if (!atual) return undefined;
            itens.delete(chave);
            itens.set(chave, atual);
            return atual;
        },
        guardar(chave, buffer) {
            apagar(chave);
            if (buffer.length > maxBytes) return;
            itens.set(chave, buffer);
            total += buffer.length;
            for (const k of itens.keys()) {
                if (total <= maxBytes) break;
                apagar(k);
            }
        },
        tamanho: () => total,
    };
}
