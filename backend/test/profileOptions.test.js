import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ALLOWED_AREAS, ALLOWED_LEVELS, ALLOWED_MODALITIES } from '../config/profileOptions.js';
import { detectArea, detectLevel, detectModality } from '../services/classify.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// A lista de áreas existe em três lugares que PRECISAM concordar: o
// classificador (produz), a UI (oferece) e o PUT /profile (aceita). Quando eles
// divergem nada quebra — a opção é silenciosamente descartada, o perfil salva
// vazio e o usuário passa a receber o feed inteiro sem filtro, sem erro nenhum.
//
// Foi assim com 'suporte': a tela oferecia "Suporte / Service Desk" desde
// sempre, o classificador marcava 116 vagas como 'suporte', e o backend jogava a
// escolha fora. Só apareceu quando um teste releu o perfil depois de salvar.
//
// Estes testes leem o arquivo do frontend como TEXTO de propósito: importar JSX
// exigiria um bundler, e a suíte roda no runner nativo do Node, sem dependência.
function opcoesDoFrontend(constante) {
    const src = readFileSync(resolve(RAIZ, 'frontend/src/utils.js'), 'utf8');
    const bloco = src.slice(src.indexOf(`export const ${constante} = [`));
    return [...bloco.slice(0, bloco.indexOf('];')).matchAll(/value:\s*'([^']+)'/g)].map((m) => m[1]);
}

test('as áreas da UI são exatamente as que o backend aceita', () => {
    assert.deepEqual(opcoesDoFrontend('AREA_OPTIONS').slice().sort(), ALLOWED_AREAS.slice().sort());
});

test('os níveis da UI são exatamente os que o backend aceita', () => {
    assert.deepEqual(opcoesDoFrontend('LEVEL_OPTIONS').slice().sort(), ALLOWED_LEVELS.slice().sort());
});

// Área que o classificador produz mas o perfil não deixa escolher fica invisível:
// as vagas existem e ninguém consegue filtrar por elas.
test('toda área que o classificador produz pode ser escolhida no perfil', () => {
    const produzidas = new Set();
    const exemplos = [
        'Desenvolvedor Backend Node', 'QA Engineer', 'Product Owner', 'Engenheiro de Dados',
        'UX Designer', 'Engenheiro DevOps', 'Desenvolvedor Android', 'Analista de Suporte Técnico',
    ];
    for (const t of exemplos) produzidas.add(detectArea({ JobTitle: t, Skills: [] }));

    const escolhiveis = new Set(ALLOWED_AREAS);
    for (const a of produzidas) {
        // 'other'/'nontech' não são escolha do usuário: o primeiro passa de
        // propósito, o segundo é barrado para todo mundo.
        if (a === 'other' || a === 'nontech') continue;
        assert.ok(escolhiveis.has(a), `o classificador produz '${a}' mas o perfil não deixa escolher`);
    }
    assert.ok(produzidas.has('suporte'), 'suporte deve continuar sendo uma área reconhecida');
});

test('toda modalidade que o classificador produz pode ser escolhida no perfil', () => {
    const casos = ['100% remoto', 'vaga híbrida', 'trabalho presencial no escritório'];
    for (const texto of casos) {
        for (const m of detectModality({ JobTitle: '', Description: texto }) || []) {
            assert.ok(ALLOWED_MODALITIES.includes(m), `modalidade '${m}' não é escolhível no perfil`);
        }
    }
});

test('todo nível que o classificador produz pode ser escolhido no perfil', () => {
    const casos = ['Estágio em TI', 'Dev Júnior', 'Dev Pleno', 'Dev Sênior', 'Tech Lead', 'Gerente de Engenharia'];
    for (const t of casos) {
        const nivel = detectLevel(t);
        if (nivel) assert.ok(ALLOWED_LEVELS.includes(nivel), `nível '${nivel}' (de "${t}") não é escolhível no perfil`);
    }
});
