import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { LangProvider } from './lib/i18n.jsx';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles.css';
import { clearChunkReloadFlag } from './lib/lazyWithReload.js';
import { capturarErros } from './lib/errorLog.js';

// Libera a trava anti-loop do recarregamento de chunk SO depois que o app
// realmente pintou. Limpar no topo do modulo (como era antes) anulava a trava: a
// pagina recarregada zerava a flag antes de saber se tinha dado certo, entao uma
// falha persistente virava recarga infinita em vez de parar e mostrar o erro.
if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => setTimeout(clearChunkReloadFlag, 2000));
} else {
    setTimeout(clearChunkReloadFlag, 2000);
}

// Guarda o ultimo erro de JS da sessao para anexar a um relato de bug.
capturarErros();

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        {/* Fora de tudo: erro em qualquer provider ou rota vira mensagem na tela,
            nunca pagina em branco. */}
        <ErrorBoundary>
        <BrowserRouter>
            <LangProvider>
                <AuthProvider>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </AuthProvider>
            </LangProvider>
        </BrowserRouter>
        </ErrorBoundary>
    </React.StrictMode>
);
