import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { consultasDoPerfil, consultasDoDia, hashtagDoTermo, areasDosPerfis, CONSULTAS_POR_DIA } from '../services/roboDoPlano.js';
import { ALLOWED_AREAS } from '../config/profileOptions.js';

const perfil = (Areas, Levels = [], Skills = []) => ({ Areas, Levels, Skills });

test('monta a busca com área, nível e a primeira skill do perfil', () => {
    assert.deepEqual(consultasDoPerfil(perfil(['frontend'], ['junior'], ['React', 'CSS'])), [
        'vaga front-end júnior', '#vagafrontend OR #vagasfrontend OR #frontend',
        'vaga React júnior', '#vagareact OR #vagasreact OR #react',
    ]);
});

test('aceita o perfil como vem do banco, em texto JSON', () => {
    assert.deepEqual(consultasDoPerfil(perfil('["qa"]', '["pleno"]', '[]')), ['vaga QA pleno', '#vagaqa OR #vagasqa OR #qa']);
});

test('com vários níveis usa o mais baixo, onde falta vaga', () => {
    assert.equal(consultasDoPerfil(perfil(['backend'], ['senior', 'junior']))[0], 'vaga back-end júnior');
});

test('nível sem termo de busca fica de fora, e perfil vazio não busca nada', () => {
    assert.equal(consultasDoPerfil(perfil(['backend'], ['lead']))[0], 'vaga back-end');
    assert.deepEqual(consultasDoPerfil(perfil([])), []);
    assert.deepEqual(consultasDoPerfil(perfil('não é json')), []);
});

test('no máximo duas áreas por pessoa', () => {
    const buscas = consultasDoPerfil(perfil(['frontend', 'backend', 'qa']));
    assert.equal(buscas.length, 4);
    assert.ok(!buscas.some((b) => b.includes('QA')));
});

test('a skill não leva aspas nem operador para a busca', () => {
    assert.equal(consultasDoPerfil(perfil([], [], ['"C#" (.NET)']))[0], 'vaga C# .NET');
});

test('toda área que o perfil aceita tem termo de busca', () => {
    for (const area of ALLOWED_AREAS) {
        assert.ok(consultasDoPerfil(perfil([area])).length, `área sem termo: ${area}`);
    }
});

test('duas pessoas iguais não pagam a mesma busca duas vezes', () => {
    const p = perfil(['qa'], ['pleno']);
    assert.deepEqual(consultasDoDia([p, p]), ['vaga QA pleno', '#vagaqa OR #vagasqa OR #qa']);
});

test('intercala as pessoas: a primeira busca de cada uma vem antes', () => {
    const buscas = consultasDoDia([perfil(['qa']), perfil(['devops'])]);
    assert.deepEqual(buscas.slice(0, 2), ['vaga QA', 'vaga devops']);
});

test('o custo não sobe com o número de compradores', () => {
    const areas = ['frontend', 'backend', 'qa', 'devops', 'data', 'design', 'mobile', 'erp'];
    assert.equal(consultasDoDia(areas.map((a) => perfil([a]))).length, CONSULTAS_POR_DIA);
});

test('acima do teto as buscas revezam e ninguém fica de fora', () => {
    const areas = ['frontend', 'backend', 'qa', 'devops', 'data', 'design', 'mobile', 'erp'];
    const perfis = areas.map((a) => perfil([a]));
    const vistas = new Set();
    for (let dia = 0; dia < 4; dia += 1) {
        for (const b of consultasDoDia(perfis, dia * 86400000)) vistas.add(b);
    }
    assert.equal(vistas.size, areas.length * 2);
});

test('sem comprador não há busca', () => {
    assert.deepEqual(consultasDoDia([]), []);
});

test('sem busca o robô para antes de chamar a Apify', async () => {
    const codigo = await readFile(new URL('../services/scraper.js', import.meta.url), 'utf8');
    assert.match(codigo, /if \(doPlano\) \{[\s\S]{0,300}semCompradores: true/);
});

test('a hashtag sai do termo: .NET vira dotnet, C# vira csharp, sem acento', () => {
    assert.equal(hashtagDoTermo('.NET'), '#vagadotnet OR #vagasdotnet OR #dotnet');
    assert.equal(hashtagDoTermo('C#'), '#vagacsharp OR #vagascsharp OR #csharp');
    assert.equal(hashtagDoTermo('dados'), '#vagadados OR #vagasdados OR #dados');
    assert.equal(hashtagDoTermo(''), '');
});

test('nenhuma busca pede "email": voltava sempre com zero post', () => {
    for (const b of consultasDoPerfil(perfil(['frontend', 'qa'], ['junior'], ['React']))) assert.doesNotMatch(b, /email/);
});

test('os recrutadores visitados seguem as áreas de TI dos compradores, expandidas como no feed', () => {
    const areas = areasDosPerfis([perfil(['frontend']), perfil(['vendas', 'qa'])]);
    assert.ok(areas.includes('frontend') && areas.includes('dev') && areas.includes('qa'));
    assert.ok(!areas.includes('vendas'));
    assert.ok(!areas.includes('backend'));
});
