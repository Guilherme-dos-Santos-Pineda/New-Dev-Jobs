// Guarda o ÚLTIMO erro de JavaScript da sessão, para anexar ao relato de bug.
//
// Sem isto, um relato chega como "não funciona" e a investigação começa do zero.
// Com a mensagem do erro e o arquivo/linha, costuma começar já resolvida.
//
// Só o último, e só em memória: não é telemetria, não persiste, não sai da aba
// enquanto o usuário não decidir enviar um relato.

let ultimo = null;

/** Mensagem curta do último erro, ou null. */
export function ultimoErro() {
    return ultimo;
}

/** Instala os listeners globais. Chamado uma vez no boot. */
export function capturarErros() {
    const registrar = (msg, origem) => {
        if (!msg) return;
        ultimo = String(msg).slice(0, 300) + (origem ? ` @ ${String(origem).slice(0, 120)}` : '');
    };

    window.addEventListener('error', (e) => {
        // Erro de carregamento de recurso (img/script) não tem `e.error` e o alvo
        // é o elemento; a URL que falhou é a informação útil ali.
        if (e.target && e.target !== window && (e.target.src || e.target.href)) {
            registrar('falha ao carregar recurso', e.target.src || e.target.href);
            return;
        }
        registrar(e.message, e.filename ? `${e.filename}:${e.lineno}` : '');
    }, true); // captura: pega também os erros de recurso, que não sobem por bubbling

    window.addEventListener('unhandledrejection', (e) => {
        const r = e.reason;
        registrar(r?.message || r, r?.stack?.split('\n')[1]?.trim());
    });
}
