import { test } from 'node:test';
import assert from 'node:assert/strict';
import { regioesDaVaga } from '../services/classify.js';
import { passesFilters } from '../services/jobsQuery.js';
import { ALLOWED_REGIONS } from '../config/profileOptions.js';

const fora = (Location, Email = 'jobs@acme.com') => ({
    Id: '1', JobTitle: 'Senior Backend Developer', Company: 'Acme', Description: 'We are hiring. Remote role, 5 years of experience.',
    Email, Location, Skills: [], CreatedAt: new Date(), Area: 'backend', Level: null, Mods: null, IsBR: false,
});

test('a região sai do local da vaga', () => {
    assert.deepEqual(regioesDaVaga(fora('Bengaluru, India')), ['asia']);
    assert.deepEqual(regioesDaVaga(fora('Lahore')), ['asia']);
    assert.deepEqual(regioesDaVaga(fora('Markham, ON, Canada')), ['america-norte']);
    assert.deepEqual(regioesDaVaga(fora('Salisbury, North Carolina')), ['america-norte']);
    assert.deepEqual(regioesDaVaga(fora('Lisboa, Portugal')), ['europa']);
    assert.deepEqual(regioesDaVaga(fora('Guadalajara, CDMX')), ['latam']);
    assert.deepEqual(regioesDaVaga(fora('Dubai')), ['oriente']);
});

test('Birmingham do Alabama é EUA, não Reino Unido', () => {
    assert.deepEqual(regioesDaVaga(fora('Birmingham, AL')), ['america-norte']);
    assert.deepEqual(regioesDaVaga(fora('Birmingham, UK')), ['europa']);
});

test('sem local, o domínio do email decide', () => {
    assert.deepEqual(regioesDaVaga(fora('', 'jobs@acme.co.uk')), ['europa']);
    assert.deepEqual(regioesDaVaga(fora('', 'jobs@acme.in')), ['asia']);
    assert.deepEqual(regioesDaVaga(fora('', 'jobs@acme.com')), []);
});

test('vaga em mais de uma região conta nas duas', () => {
    assert.deepEqual(regioesDaVaga(fora('USA, United Kingdom')), ['america-norte', 'europa']);
});

test('o texto do post não decide: citar Londres não é vaga em Londres', () => {
    assert.deepEqual(regioesDaVaga({ ...fora(''), Description: 'Our headquarters are in London.' }), []);
});

test('marcar região tira só o que é de outra região', () => {
    const perfil = { Region: 'intl', Regions: ['europa'] };
    assert.equal(passesFilters(fora('Lisboa, Portugal'), perfil), true);
    assert.equal(passesFilters(fora('Bengaluru, India'), perfil), false);
});

test('vaga sem país identificado continua aparecendo', () => {
    assert.equal(passesFilters(fora(''), { Region: 'intl', Regions: ['europa'] }), true);
});

test('Índia e Paquistão seguem disponíveis: sem marcar nada, nada muda', () => {
    assert.equal(passesFilters(fora('Bengaluru, India'), { Region: 'intl' }), true);
    assert.equal(passesFilters(fora('Bengaluru, India'), { Region: 'intl', Regions: ['asia'] }), true);
});

test('quem procura no Brasil não é afetado por região salva', () => {
    const br = { ...fora('São Paulo/SP'), Description: 'Vaga em São Paulo', IsBR: true };
    assert.equal(passesFilters(br, { Region: 'br', Regions: ['europa'] }), true);
});

test('o perfil só aceita as regiões que o classificador produz', () => {
    assert.deepEqual(ALLOWED_REGIONS, ['america-norte', 'europa', 'latam', 'asia', 'oriente']);
});
