// Lint do BACKEND: só `no-undef`, e por um motivo concreto.
//
// Função usada sem import passa por `node --check`, pelo `import()` do módulo e
// pelos testes (que não chamam as rotas): o ReferenceError só estoura quando a
// rota roda. Foi assim que `condicaoMonitoravel` ficou sem import em admin.js
// E dashboard.js, e o painel de TODO usuário passou a dar 500.
//
// O eslint mora em frontend/node_modules (o backend não tem dependência de dev),
// por isso o import com caminho relativo.
import globals from './frontend/node_modules/globals/index.js';

export default [
    { ignores: ['**/node_modules/**'] },
    {
        files: ['backend/**/*.{js,mjs}'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.node },
        },
        rules: { 'no-undef': 'error' },
    },
];
