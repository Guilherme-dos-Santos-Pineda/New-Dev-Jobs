import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { LangProvider } from './lib/i18n.jsx';
import App from './App.jsx';
import './styles.css';
import { clearChunkReloadFlag } from './lib/lazyWithReload.js';

// O app subiu inteiro: libera a trava anti-loop do recarregamento de chunk.
clearChunkReloadFlag();

createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <LangProvider>
                <AuthProvider>
                    <ToastProvider>
                        <App />
                    </ToastProvider>
                </AuthProvider>
            </LangProvider>
        </BrowserRouter>
    </React.StrictMode>
);
