import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `command` distingue `vite dev` de `vite build`.
export default defineConfig(({ command }) => ({
    // Em produção a landing (HTML estático) ocupa a raiz do domínio e o app vive
    // sob /app/ — então os assets precisam sair com esse prefixo. No dev server
    // não há landing concorrendo pela raiz, e as rotas públicas do React Router
    // (/login, /signup, ...) são absolutas: manter base '/' evita 404 local.
    base: command === 'build' ? '/app/' : '/',
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            // Encaminha chamadas /api para o backend Express
            '/api': 'http://localhost:3001',
        },
    },
    build: {
        rollupOptions: {
            output: {
                // Separa dependências grandes e estáveis em chunks próprios: o
                // hash deles não muda quando o código da app muda, então o browser
                // mantém em cache entre deploys.
                manualChunks: {
                    react: ['react', 'react-dom', 'react-router-dom'],
                    supabase: ['@supabase/supabase-js'],
                },
            },
        },
    },
}));
