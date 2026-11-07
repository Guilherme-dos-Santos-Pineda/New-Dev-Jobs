import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tituloDoPost, vagaDoPost, semRepetidas, vagasParaPerfil } from '../services/vagasPorLink.js';
import { passesFilters } from '../services/jobsQuery.js';

const ID = '7523150158214144000';
const post = (Content, extra = {}) => ({
    Id: '1', LinkedinId: ID, Url: null, Content, PostedAt: new Date(), CreatedAt: new Date(), ...extra,
});
const DEV = '🚀 VAGA | Desenvolvedor Java Pleno\nVaga remota em São Paulo/SP, com Java e Spring.\nCandidate-se: https://lnkd.in/abc123';

test('o título tira emoji e a palavra vaga da frente', () => {
    assert.equal(tituloDoPost(DEV), 'Desenvolvedor Java Pleno');
    assert.equal(tituloDoPost('🔥 OPORTUNIDADE: QA Sênior'), 'QA Sênior');
    assert.equal(tituloDoPost('\n\nDev iOS sênior: vaga remota.'), 'Dev iOS sênior: vaga remota.');
});

test('título enorme é cortado', () => {
    assert.ok(tituloDoPost('Desenvolvedor '.repeat(20)).length <= 100);
});

test('post de TI com link vira vaga, com o link do post', () => {
    const v = vagaDoPost(post(DEV));
    assert.equal(v.JobTitle, 'Desenvolvedor Java Pleno');
    assert.equal(v.Area, 'backend');
    assert.equal(v.url, `https://www.linkedin.com/feed/update/urn:li:activity:${ID}/`);
});

test('post com email fica de fora: esse vai para o feed normal', () => {
    assert.equal(vagaDoPost(post(`${DEV}\nCurrículo para rh@acme.com.br`)), null);
});

test('sem link, ou sem anunciar vaga, não entra', () => {
    assert.equal(vagaDoPost(post('Desenvolvedor Java Pleno\nVaga remota em São Paulo/SP')), null);
    assert.equal(vagaDoPost(post('Desenvolvedor Java: meu artigo novo sobre Spring\nhttps://lnkd.in/abc')), null);
});

test('sem endereço para abrir o post, não entra', () => {
    assert.equal(vagaDoPost(post(DEV, { LinkedinId: null })), null);
});

test('outra profissão não entra, e área de fora de TI oferecida entra', () => {
    assert.equal(vagaDoPost(post('Vaga: Enfermeiro Plantonista\nHospital em São Paulo/SP\nhttps://lnkd.in/abc')), null);
    assert.ok(vagaDoPost(post('Vaga: Assistente Administrativo\nEm São Paulo/SP\nhttps://lnkd.in/abc')));
});

test('vaga encerrada não entra', () => {
    assert.equal(vagaDoPost(post('Vaga: Desenvolvedor Java\nProcesso seletivo encerrado\nhttps://lnkd.in/abc')), null);
});

test('o mesmo anúncio repostado aparece uma vez, a versão mais nova', () => {
    const velho = { ...vagaDoPost(post(DEV)), Id: 'a', CreatedAt: new Date(Date.now() - 86400000) };
    const novo = { ...vagaDoPost(post(DEV)), Id: 'b' };
    assert.deepEqual(semRepetidas([velho, novo]).map((v) => v.Id), ['b']);
});

test('sem a opção, a vaga sem email continua barrada no feed', () => {
    const v = vagaDoPost(post(DEV));
    assert.equal(passesFilters(v, { Region: 'br' }), false);
    assert.equal(passesFilters(v, { Region: 'br' }, { semEmail: true }), true);
});

test('os filtros do perfil valem aqui também', () => {
    const lista = [vagaDoPost(post(DEV))];
    assert.equal(vagasParaPerfil(lista, { Region: 'br', Areas: ['backend'] }).length, 1);
    assert.equal(vagasParaPerfil(lista, { Region: 'br', Areas: ['qa'] }).length, 0);
    assert.equal(vagasParaPerfil(lista, { Region: 'br', BlockedWords: ['spring'] }).length, 0);
});

test('vaga com mais de 30 dias sai da lista', () => {
    const velha = vagaDoPost(post(DEV, { PostedAt: new Date(Date.now() - 31 * 86400000) }));
    assert.equal(vagasParaPerfil([velha], { Region: 'br' }).length, 0);
});

test('a semana vem antes, e nela o melhor match', () => {
    const dias = (n) => new Date(Date.now() - n * 86400000);
    const java = vagaDoPost(post(DEV, { Id: '1', PostedAt: dias(2) }));
    const qa = vagaDoPost(post('Vaga: Analista de QA\nTestes com Cypress em São Paulo/SP\nhttps://lnkd.in/x', { Id: '2', PostedAt: dias(1) }));
    const antiga = vagaDoPost(post('Vaga: Desenvolvedor Java Sênior\nJava em São Paulo/SP\nhttps://lnkd.in/y', { Id: '3', PostedAt: dias(20) }));
    const perfil = { Region: 'br', Skills: ['Java', 'Spring'] };
    assert.deepEqual(vagasParaPerfil([antiga, qa, java], perfil).map((v) => v.id), ['link-1', 'link-2', 'link-3']);
});

test('a resposta não leva link nem telefone na descrição', () => {
    const texto = `${DEV}\nWhatsApp (11) 94111-4322`;
    const [v] = vagasParaPerfil([vagaDoPost(post(texto))], { Region: 'br' });
    assert.doesNotMatch(v.description, /lnkd\.in|94111/);
});
