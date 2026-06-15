import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
});
