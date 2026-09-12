import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

// =========================
// Lint mínimo, de propósito
// =========================
// Não é um guia de estilo: é uma rede contra a classe de erro que passa por
// TUDO o que já existe aqui. O build compila, os 122 testes de backend passam e
// as 247 verificações da prova real passam, porque nada disso monta um
// componente React. Um erro de render só aparece na tela de quem abriu o app.
//
// Foi assim que uma `const` usada quatro linhas ANTES de ser declarada
// (`configurado`, no Dashboard) chegou em produção e quebrou o app para todo
// mundo que estivesse logado. Deslogado funcionava, porque o Dashboard nem monta.
//
// Só as regras que pegam erro REAL ficam ligadas. Regra de formatação aqui só
// criaria ruído e faria o time aprender a ignorar o lint inteiro.
export default [
    {
        files: ['src/**/*.{js,jsx}'],
        plugins: { 'react-hooks': reactHooks },
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser },
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: {
            ...js.configs.recommended.rules,

            // A regra que motivou este arquivo: ReferenceError de temporal dead
            // zone. `const x = ...` usado acima da própria declaração compila e
            // explode em runtime.
            'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],

            // Também explodem em runtime, e nenhuma delas é questão de gosto.
            'no-undef': 'error',
            'no-dupe-keys': 'error',      // chave repetida no dicionário do i18n
            'no-unreachable': 'error',
            'no-const-assign': 'error',
            'no-self-compare': 'error',

            'react-hooks/rules-of-hooks': 'error',

            // Barulho sem risco: desligadas para o lint continuar valendo a pena.
            // `no-unused-vars` fica FORA porque sem o plugin do React ele não
            // enxerga uso em JSX e acusa todo componente importado. Lint que
            // grita à toa ensina a ignorar o lint inteiro.
            'no-unused-vars': 'off',
            'react-hooks/exhaustive-deps': 'off',
            'no-empty': 'off',            // `catch {}` proposital é padrão aqui
        },
    },
];
