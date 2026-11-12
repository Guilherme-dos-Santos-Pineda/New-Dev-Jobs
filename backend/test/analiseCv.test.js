import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    lerResposta, mensagemDoUsuario, palavrasDoFeed, analisesRestantes, SISTEMA, LIMITE_ANALISES,
    lerControle, acessoLiberado,
} from '../services/analiseCvLogic.js';

const CV = 'Maria Souza. Desenvolvedora na Acme de 2022 a 2024. React, TypeScript e Node.js. Análise e Desenvolvimento de Sistemas.';
const resposta = (extra = {}) => JSON.stringify({
    scoreEmpregabilidade: 72,
    resumoExecutivo: 'Base boa.',
    pontosFortes: ['React na Acme'],
    pontosFracos: ['Sem projetos'],
    dicas: ['Mostre o impacto do trabalho na Acme'],
    palavrasChaveATS: ['React', 'Docker', 'typescript'],
    curriculoReescrito: {
        nome: 'Maria Souza', resumoProfissional: 'Desenvolvedora front-end.',
        experiencias: [{ cargo: 'Desenvolvedora', empresa: 'Acme', periodo: '2022 a 2024', atividades: ['Criou telas em React'] }],
        formacao: [{ curso: 'ADS', instituicao: 'X', periodo: '2021' }],
    },
    ...extra,
});

test('lê a resposta e marca as palavras-chave que já estão no currículo original', () => {
    const r = lerResposta(resposta(), CV);
    assert.equal(r.score, 72);
    assert.deepEqual(r.palavrasChave, [
        { palavra: 'React', temNoCurriculo: true },
        { palavra: 'Docker', temNoCurriculo: false },
        { palavra: 'typescript', temNoCurriculo: true },
    ]);
    assert.equal(r.curriculo.experiencias[0].atividades[0], 'Criou telas em React');
});

test('aceita texto em volta do JSON e corta nota fora de 0 a 100', () => {
    const r = lerResposta(`Aqui está:\n${resposta({ scoreEmpregabilidade: 140 })}\nFim`, CV);
    assert.equal(r.score, 100);
});

test('resposta sem currículo reescrito ou quebrada não conta como análise', () => {
    assert.equal(lerResposta('não sei', CV), null);
    assert.equal(lerResposta('{ quebrado', CV), null);
    assert.equal(lerResposta(JSON.stringify({ scoreEmpregabilidade: 50, curriculoReescrito: {} }), CV), null);
});

test('campos de tipo errado não quebram a tela', () => {
    const r = lerResposta(resposta({ dicas: 'uma string', pontosFortes: [null, 'ok', 3] }), CV);
    assert.deepEqual(r.dicas, []);
    assert.deepEqual(r.pontosFortes, ['ok', '3']);
});

test('o prompt proíbe inventar e pede lembrete entre colchetes', () => {
    assert.match(SISTEMA, /NUNCA invente/);
    assert.match(SISTEMA, /\[quantos usuários\?\]/);
    assert.doesNotMatch(SISTEMA, /adicione métricas quando possível/i);
});

test('a mensagem leva área, nível e as palavras do feed da pessoa', () => {
    const m = mensagemDoUsuario(CV, { Areas: ['frontend'], Levels: '["junior"]' }, ['React', 'CSS']);
    assert.match(m, /front-end/);
    assert.match(m, /júnior/);
    assert.match(m, /React, CSS/);
    assert.ok(m.endsWith(CV));
});

test('as palavras do feed são as skills que mais aparecem, uma vez por vaga', () => {
    const vagas = [{ skills: ['React', 'React', 'CSS'] }, { skills: ['react', 'Node'] }, { skills: ['Node', 'React'] }];
    assert.deepEqual(palavrasDoFeed(vagas, 2), ['React', 'Node']);
});

test('2 análises grátis por pessoa; admin sem limite', () => {
    assert.equal(LIMITE_ANALISES, 2);
    assert.equal(analisesRestantes(0), 2);
    assert.equal(analisesRestantes(2), 0);
    assert.equal(analisesRestantes(5), 0);
    assert.equal(analisesRestantes(9, { admin: true }), Infinity);
});

test('controle do admin: limite global, extras por pessoa e bloqueio', () => {
    assert.equal(analisesRestantes(3, { limite: 3, extras: 2 }), 2);
    assert.equal(analisesRestantes(0, { limite: 5 }), 5);
    assert.equal(analisesRestantes(0, { limite: 0 }), 0);
    assert.equal(analisesRestantes(0, { bloqueado: true, extras: 10 }), 0);
    assert.equal(analisesRestantes(0, { bloqueado: true, admin: true }), Infinity);
});

test('controle sem valor gravado vale o padrão: ligada e LIMITE_ANALISES', () => {
    assert.deepEqual(lerControle(undefined), { ativa: true, limite: LIMITE_ANALISES, versoesAtivas: true });
    assert.deepEqual(lerControle({ ativa: false }), { ativa: false, limite: LIMITE_ANALISES, versoesAtivas: true });
    assert.deepEqual(lerControle({ limite: 999 }), { ativa: true, limite: 50, versoesAtivas: true });
    assert.deepEqual(lerControle({ limite: '7' }), { ativa: true, limite: LIMITE_ANALISES, versoesAtivas: true });
    // As duas abas têm chave própria: desligar as versões não desliga a análise.
    assert.deepEqual(lerControle({ versoesAtivas: false }), { ativa: true, limite: LIMITE_ANALISES, versoesAtivas: false });
});

test('desligada ou bloqueado tira o acesso, menos do admin', () => {
    assert.equal(acessoLiberado({ ativa: true }), true);
    assert.equal(acessoLiberado({ ativa: false }), false);
    assert.equal(acessoLiberado({ bloqueado: true }), false);
    assert.equal(acessoLiberado({ ativa: false, admin: true }), true);
    assert.equal(acessoLiberado({ bloqueado: true, admin: true }), true);
});

// Relato de 12/11/2026: o currículo reescrito trazia cidade e ano que não estavam no original.
test('conferirFatos: tira ano e cidade inventados, mantém o que está no original', async () => {
    const { conferirFatos } = await import('../services/analiseCvLogic.js');
    const original = 'Maria Souza\nmaria@exemplo.com | (11) 98888-7777\nAnálise e Desenvolvimento de Sistemas, Fatec, 2019 - 2021\nDesenvolvedora na Acme, 2022 - atual';
    const cv = {
        nome: 'Maria Souza', titulo: 'Desenvolvedora', contato: 'maria@exemplo.com | (11) 98888-7777 | São Paulo/SP | linkedin.com/in/maria-inventada',
        resumoProfissional: 'Desenvolvedora baseada em São Paulo com experiência desde 2022.',
        habilidades: [], projetos: [], certificacoes: [], idiomas: [],
        experiencias: [{ cargo: 'Desenvolvedora', empresa: 'Acme', periodo: '2022 - atual', atividades: ['Criou APIs em Campinas em 2023'], tecnologias: '' }],
        formacao: [{ curso: 'Análise e Desenvolvimento de Sistemas', instituicao: 'Fatec', periodo: '2019 - 2021' }, { curso: 'MBA', instituicao: 'USP', periodo: '2024' }],
    };
    const r = conferirFatos(cv, original);
    assert.equal(r.contato, 'maria@exemplo.com | (11) 98888-7777 | linkedin.com/in/maria-inventada', 'contato verdadeiro fica, só a cidade inventada sai');
    assert.ok(!/s[ãa]o paulo/i.test(r.resumoProfissional), r.resumoProfissional);
    assert.ok(r.resumoProfissional.includes('2022'));
    assert.equal(r.experiencias[0].periodo, '2022 - atual');
    assert.ok(!/campinas|2023/i.test(r.experiencias[0].atividades[0]), r.experiencias[0].atividades[0]);
    assert.equal(r.formacao[0].periodo, '2019 - 2021');
    assert.equal(r.formacao[1].periodo, '', 'ano de conclusão que não existe no original sai');
});

test('conferirFatos: cidade escrita no original fica, com ou sem acento', async () => {
    const { conferirFatos } = await import('../services/analiseCvLogic.js');
    const r = conferirFatos({ contato: 'Sao Paulo, SP', resumoProfissional: 'Moro em São Paulo.', experiencias: [], formacao: [] }, 'Contato: São Paulo - SP');
    assert.equal(r.contato, 'Sao Paulo, SP');
    assert.equal(r.resumoProfissional, 'Moro em São Paulo.');
});

test('conferirFatos: ano colado no texto do PDF conta; nome de faculdade não perde a cidade', async () => {
    const { conferirFatos } = await import('../services/analiseCvLogic.js');
    const original = 'Jovem Aprendiz em Distribuição 2018 - 2020Philip Morris Brasil\nFormação: UNIVESP';
    const r = conferirFatos({
        experiencias: [{ cargo: 'Jovem Aprendiz', empresa: 'Philip Morris', periodo: '2018 - 2020', atividades: [] }],
        formacao: [{ curso: 'Engenharia de Computação', instituicao: 'Universidade Virtual do Estado de São Paulo (UNIVESP)', periodo: '' }],
    }, original);
    assert.equal(r.experiencias[0].periodo, '2018 - 2020');
    assert.equal(r.formacao[0].instituicao, 'Universidade Virtual do Estado de São Paulo (UNIVESP)');
});

test('conferirFatos: cidade pequena no formato Cidade/UF também sai se não estiver no original', async () => {
    const { conferirFatos } = await import('../services/analiseCvLogic.js');
    const r = conferirFatos({ contato: 'joao@x.com | (16) 99999-0000 | Araraquara/SP', resumoProfissional: 'Dev em Leopoldina - MG.', experiencias: [], formacao: [] },
        'joao@x.com (16) 99999-0000 Leopoldina - MG');
    assert.equal(r.contato, 'joao@x.com | (16) 99999-0000');
    assert.equal(r.resumoProfissional, 'Dev em Leopoldina - MG.');
});

test('a IA recebe a data de hoje: 2026 não vira 2024 (relato de 12/11/2026)', async () => {
    const { mensagemDoUsuario } = await import('../services/analiseCvLogic.js');
    const { mensagemVersao } = await import('../services/cvVersoesLogic.js');
    const agora = new Date('2026-11-12T12:00:00Z');
    assert.match(mensagemDoUsuario('cv', {}, [], agora), /Hoje é 2026-11-12/);
    assert.match(mensagemVersao('cv', { area: 'backend', lang: 'pt' }, agora), /Hoje é 2026-11-12/);
});
