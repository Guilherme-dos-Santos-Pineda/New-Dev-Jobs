import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formaDoCurriculo, curriculoTemConteudo, lerResposta } from '../services/analiseCvLogic.js';

test('edição do currículo: item apagado sai, tamanhos cortados, lixo vira vazio', () => {
    const cv = formaDoCurriculo({
        nome: '  Ana   Souza ', resumoProfissional: 'x'.repeat(5000),
        experiencias: [
            { cargo: 'Dev', empresa: 'ACME', periodo: '2020 - 2024', atividades: ['Fiz a API', '', '  '], tecnologias: 'Node' },
            { cargo: '', empresa: '', periodo: '', atividades: [], tecnologias: '' },
        ],
        habilidades: [{ categoria: '', itens: '' }], certificacoes: ['AWS', ''], idiomas: 'inglês',
        extra: '<script>',
    }, { semVazios: true });
    assert.equal(cv.nome, 'Ana Souza');
    assert.equal(cv.resumoProfissional.length, 1500);
    assert.equal(cv.experiencias.length, 1);
    assert.deepEqual(cv.experiencias[0].atividades, ['Fiz a API']);
    assert.deepEqual(cv.habilidades, []);
    assert.deepEqual(cv.certificacoes, ['AWS']);
    assert.deepEqual(cv.idiomas, []);
    assert.equal('extra' in cv, false);
});

test('currículo apagado inteiro não salva; a resposta da IA continua lida igual', () => {
    assert.equal(curriculoTemConteudo(formaDoCurriculo({ nome: 'Ana' }, { semVazios: true })), false);
    assert.equal(curriculoTemConteudo(formaDoCurriculo(null)), false);
    const r = lerResposta(JSON.stringify({ scoreEmpregabilidade: 80, curriculoReescrito: { resumoProfissional: 'Dev back-end', experiencias: [{ cargo: '', empresa: '' }] } }));
    assert.equal(r.score, 80);
    assert.equal(r.curriculo.experiencias.length, 1);
});
