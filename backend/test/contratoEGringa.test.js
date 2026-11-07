import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contratoDaVaga, jobIsBR, vagaEmEspanhol } from '../services/classify.js';
import { passesFilters } from '../services/jobsQuery.js';
import { ALLOWED_CONTRACTS } from '../config/profileOptions.js';

const vaga = (extra = {}) => ({
    Id: '1', JobTitle: 'Desenvolvedor Java', Company: 'Acme', Description: 'Vaga em São Paulo/SP',
    Email: 'rh@acme.com.br', Skills: [], CreatedAt: new Date(), Area: 'backend', Level: null, Mods: null, IsBR: true, ...extra,
});

test('o contrato sai do título e do post', () => {
    assert.deepEqual(contratoDaVaga(vaga({ JobTitle: 'Product Designer Sênior - PJ' })), ['pj']);
    assert.deepEqual(contratoDaVaga(vaga({ Description: 'Regime CLT com benefícios' })), ['clt']);
    assert.deepEqual(contratoDaVaga(vaga({ Description: 'Contratação CLT ou PJ' })), ['clt', 'pj']);
    assert.deepEqual(contratoDaVaga(vaga({ Description: 'Contrato como pessoa jurídica' })), ['pj']);
    assert.deepEqual(contratoDaVaga(vaga()), []);
});

test('letra estilizada do LinkedIn também conta', () => {
    assert.deepEqual(contratoDaVaga(vaga({ Description: 'Contratação: 𝗣𝗝' })), ['pj']);
});

test('pj dentro de email, link ou outra palavra não conta', () => {
    assert.deepEqual(contratoDaVaga(vaga({ Description: 'Envie para pj@acme.com ou https://acme.com/pj/vagas' })), []);
    assert.deepEqual(contratoDaVaga(vaga({ Description: 'Experiência com PJe e projeto' })), []);
});

test('o filtro de contrato tira só o que diz outro tipo', () => {
    const perfil = { Region: 'br', Contracts: ['pj'] };
    assert.equal(passesFilters(vaga({ Description: 'São Paulo/SP, PJ' }), perfil), true);
    assert.equal(passesFilters(vaga({ Description: 'São Paulo/SP, CLT' }), perfil), false);
    assert.equal(passesFilters(vaga({ Description: 'São Paulo/SP, CLT ou PJ' }), perfil), true);
});

test('vaga que não informa o contrato continua aparecendo', () => {
    assert.equal(passesFilters(vaga(), { Region: 'br', Contracts: ['pj'] }), true);
});

test('sem contrato marcado, nada muda', () => {
    assert.equal(passesFilters(vaga({ Description: 'São Paulo/SP, CLT' }), { Region: 'br' }), true);
});

test('o perfil só aceita os contratos que o classificador produz', () => {
    assert.deepEqual(ALLOWED_CONTRACTS, ['clt', 'pj']);
});

test('post em letra estilizada é reconhecido como brasileiro', () => {
    const v = vaga({
        Email: 'rh@inbetta.com', JobTitle: 'Analista de Negócios SAP MM',
        Description: '📢 𝗢𝗣𝗢𝗥𝗧𝗨𝗡𝗜𝗗𝗔𝗗𝗘 | 𝗔𝗡𝗔𝗟𝗜𝗦𝗧𝗔 𝗗𝗘 𝗡𝗘𝗚Ó𝗖𝗜𝗢𝗦\nExperiência com SAP MM.',
    });
    assert.equal(jobIsBR(v), true);
});

test('post em português sem cidade é brasileiro', () => {
    const v = vaga({ Email: 'rh@actdigital.com', JobTitle: 'Analista de Testes (QA)', Description: 'Banco de talentos: experiência com automação e conhecimento em Cypress.' });
    assert.equal(jobIsBR(v), true);
});

test('local escrito como (SP) ou -SP é Brasil', () => {
    assert.equal(jobIsBR(vaga({ Email: 'a@mazza.tech', Description: '', Location: 'Av. Paulista -SP' })), true);
    assert.equal(jobIsBR(vaga({ Email: 'a@acme.tech', Description: '', Location: 'Parque Anhanguera (SP)' })), true);
});

test('Portugal continua fora do Brasil, mesmo em português', () => {
    assert.equal(jobIsBR(vaga({ Email: 'a@acme.com', Description: 'Oportunidade em Lisboa, experiência com SAP.', Location: '' })), false);
    assert.equal(jobIsBR(vaga({ Email: 'a@hays.pt', Description: 'Oportunidade, experiência com SAP.', Location: 'Oeiras – Portugal' })), false);
});

test('Lima-PE é Peru, não Pernambuco', () => {
    assert.equal(jobIsBR(vaga({ Email: 'a@acme.com', Description: '', Location: 'Lima - PE, Peru' })), false);
});

test('quem quer gringa não recebe vaga brasileira nem em espanhol', () => {
    const perfil = { Region: 'intl' };
    const fora = { Email: 'jobs@acme.com', JobTitle: 'Senior Backend Developer', Area: 'backend', IsBR: false };
    assert.equal(passesFilters(vaga({ ...fora, Description: 'We are hiring. Remote role, 5 years of experience.' }), perfil), true);
    assert.equal(passesFilters(vaga({ ...fora, Description: 'Oportunidade remota, experiência com Java e conhecimento em Spring.' }), perfil), false);
    const espanhol = 'Buscamos desarrollador con experiencia y conocimientos en Java. Ofrecemos sueldo competitivo.';
    assert.equal(vagaEmEspanhol({ Description: espanhol }), true);
    assert.equal(passesFilters(vaga({ ...fora, Description: espanhol }), perfil), false);
});
