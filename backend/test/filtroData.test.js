import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FILTRO_DATA_ATIVO } from '../config/filtroData.js';
import { passesFilters, candidatasDoPerfil } from '../services/jobsQuery.js';
import { linkDoPost } from '../services/linkDoPost.js';

const HORA = 3600000;
const vaga = (Id, horas) => ({
    Id, JobTitle: 'Desenvolvedor Back-end', Company: 'Acme', Description: 'Vaga em São Paulo/SP',
    Email: 'rh@acme.com.br', Skills: [], CreatedAt: new Date(Date.now() - horas * HORA),
    Area: 'backend', Level: null, Mods: null, IsBR: true,
});

test('a chave do filtro de data é a mesma no backend e no front', async () => {
    const front = await readFile(new URL('../../frontend/src/lib/flags.js', import.meta.url), 'utf8');
    assert.match(front, new RegExp(`FILTRO_DATA_ATIVO = ${FILTRO_DATA_ATIVO}`));
});

test('últimas 24 horas: fica a vaga de 12 horas e sai a de 2 dias', () => {
    const perfil = { PostingDays: 1, Region: 'br' };
    assert.equal(passesFilters(vaga('1', 12), perfil), true);
    assert.equal(passesFilters(vaga('2', 48), perfil), false);
});

test('o corte barato e o filtro final concordam na data', () => {
    const perfil = { PostingDays: 7, Region: 'br' };
    const vagas = [vaga('1', 24), vaga('2', 24 * 6.9), vaga('3', 24 * 7.1)];
    const baratas = candidatasDoPerfil(vagas, perfil).map((v) => v.Id);
    assert.deepEqual(baratas, vagas.filter((v) => passesFilters(v, perfil)).map((v) => v.Id));
    assert.deepEqual(baratas, ['1', '2']);
});

test('sem data escolhida, vaga antiga continua aparecendo', () => {
    assert.equal(passesFilters(vaga('1', 24 * 200), { PostingDays: null, Region: 'br' }), true);
});

test('o link do post sai do id guardado na vaga', () => {
    assert.equal(linkDoPost('7523150158214144000'), 'https://www.linkedin.com/feed/update/urn:li:activity:7523150158214144000/');
});

test('sem id válido não há link', () => {
    assert.equal(linkDoPost(null), null);
    assert.equal(linkDoPost(''), null);
    assert.equal(linkDoPost('abc/../../x'), null);
});

test('o link do post não vai para o feed, só para Enviadas', async () => {
    const feed = await readFile(new URL('../services/jobsQuery.js', import.meta.url), 'utf8');
    assert.doesNotMatch(feed, /linkDoPost|postUrl/);
});
