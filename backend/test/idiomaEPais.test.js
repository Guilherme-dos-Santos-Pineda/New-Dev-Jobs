import { test } from 'node:test';
import assert from 'node:assert/strict';
import { idiomaDaVaga } from '../services/classify.js';
import { renderEmail, DEFAULTS } from '../services/templates.js';
import { passesFilters, candidatasDoPerfil } from '../services/jobsQuery.js';

const vaga = (extra = {}) => ({
    Id: '1', JobTitle: 'Desenvolvedor Java', Company: 'Acme', Description: 'Vaga em São Paulo/SP',
    Email: 'rh@acme.com.br', Skills: [], CreatedAt: new Date(), Area: 'backend', Level: null, Mods: null, IsBR: true, ...extra,
});
const gringa = (extra = {}) => vaga({
    JobTitle: 'Senior Backend Developer', Description: 'We are hiring a developer with 5 years of experience. Remote role.',
    Email: 'jobs@acme.com', Location: 'Remote', IsBR: false, ...extra,
});

test('vaga brasileira recebe email em português', () => {
    assert.equal(idiomaDaVaga(vaga()), 'pt');
});

test('vaga de fora escrita em inglês recebe email em inglês', () => {
    assert.equal(idiomaDaVaga(gringa()), 'en');
});

test('vaga de fora escrita em português continua em português', () => {
    assert.equal(idiomaDaVaga(gringa({ JobTitle: 'Consultor SAP', Description: 'Oportunidade em Lisboa, experiência com SAP e conhecimentos em ABAP.' })), 'pt');
});

test('o modelo em inglês sai todo em inglês, com a frase de contato também', () => {
    const r = renderEmail({
        subjectTemplate: DEFAULTS.en.subject, bodyTemplate: DEFAULTS.en.body, lang: 'en',
        user: { Name: 'Ana Souza', Email: 'ana@gmail.com' }, profile: { Linkedin: 'https://linkedin.com/in/ana' },
        job: gringa(),
    });
    assert.equal(r.subject, 'Application for Senior Backend Developer at Acme');
    assert.match(r.text, /I'm available on LinkedIn/);
    assert.doesNotMatch(r.text, /disponível/);
});

test('"Brasil e exterior" mostra as duas', () => {
    const perfil = { Region: 'ambos' };
    assert.equal(passesFilters(vaga(), perfil), true);
    assert.equal(passesFilters(gringa(), perfil), true);
});

test('"Brasil e exterior" continua sem vaga em espanhol', () => {
    const espanhol = gringa({ Description: 'Buscamos desarrollador con experiencia y conocimientos en Java. Ofrecemos sueldo competitivo.' });
    assert.equal(passesFilters(espanhol, { Region: 'ambos' }), false);
});

test('a região marcada só corta as de fora: as brasileiras ficam', () => {
    const perfil = { Region: 'ambos', Regions: ['europa'] };
    assert.equal(passesFilters(vaga(), perfil), true);
    assert.equal(passesFilters(gringa({ Location: 'Bengaluru, India' }), perfil), false);
});

test('o corte barato concorda com o filtro final nos três modos', () => {
    const vagas = [vaga({ Id: '1' }), gringa({ Id: '2' })];
    for (const Region of ['br', 'intl', 'ambos']) {
        const perfil = { Region };
        const barato = candidatasDoPerfil(vagas, perfil).map((v) => v.Id);
        assert.deepEqual(barato, vagas.filter((v) => passesFilters(v, perfil)).map((v) => v.Id), Region);
    }
});
