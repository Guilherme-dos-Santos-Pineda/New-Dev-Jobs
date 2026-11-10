import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linhaDaVaga, BUSCAS, FONTE } from '../services/vagasAnunciadas.js';
import { vagaDoPost, semRepetidas, vagasParaPerfil } from '../services/vagasPorLink.js';

const item = (extra = {}) => ({
    job_id: '4420001234', job_title: 'Desenvolvedor Front-end Pleno', company_name: 'Acme',
    location: 'São Paulo, São Paulo, Brazil', job_url: 'https://br.linkedin.com/jobs/view/4420001234?trk=abc',
    posted_date: new Date().toISOString(), job_description: 'Vaga com React e TypeScript.', ...extra,
});
const comoPost = (linha, id = '1') => ({ ...linha, Id: id, CreatedAt: new Date() });

test('a vaga do ator vira linha de posts, sem a query do link', () => {
    const l = linhaDaVaga(item());
    assert.equal(l.Source, FONTE);
    assert.equal(l.LinkedinId, 'vaga-4420001234');
    assert.equal(l.Url, 'https://br.linkedin.com/jobs/view/4420001234');
    assert.equal(l.Author, 'Acme');
    assert.match(l.Content, /^Desenvolvedor Front-end Pleno\nAcme\n📍 Local: São Paulo/);
});

test('sem id, título ou link do LinkedIn não entra', () => {
    assert.equal(linhaDaVaga(item({ job_id: '' })), null);
    assert.equal(linhaDaVaga(item({ job_title: '' })), null);
    assert.equal(linhaDaVaga(item({ job_url: 'https://golpe.com/vaga' })), null);
});

test('data ruim não quebra: fica sem data', () => {
    assert.equal(linhaDaVaga(item({ posted_date: 'ontem' })).PostedAt, null);
});

test('a vaga anunciada aparece em vagas por link, com empresa, local e o link do anúncio', () => {
    const v = vagaDoPost(comoPost(linhaDaVaga(item())));
    assert.equal(v.JobTitle, 'Desenvolvedor Front-end Pleno');
    assert.equal(v.Company, 'Acme');
    assert.equal(v.Area, 'frontend');
    assert.equal(v.IsBR, true);
    assert.equal(v.url, 'https://br.linkedin.com/jobs/view/4420001234');
});

test('mesmo com o texto curto, sem descrição', () => {
    const v = vagaDoPost(comoPost(linhaDaVaga(item({ job_description: '' }))));
    assert.equal(v.Area, 'frontend');
});

test('anúncio com email na descrição fica de fora: o link entregaria o contato', () => {
    assert.equal(vagaDoPost(comoPost(linhaDaVaga(item({ job_description: 'Envie para rh@acme.com' })))), null);
});

test('vaga de outra área entra só para quem marca a área', () => {
    const v = vagaDoPost(comoPost(linhaDaVaga(item({ job_title: 'Assistente Administrativo', job_description: '' }))));
    assert.ok(v);
    assert.equal(vagasParaPerfil([v], { Region: 'br', Areas: ['frontend'] }).length, 0);
    assert.equal(vagasParaPerfil([v], { Region: 'br', Areas: ['adm'] }).length, 1);
});

test('vaga da América Latina vai para quem procura fora do Brasil', () => {
    const v = vagaDoPost(comoPost(linhaDaVaga(item({ job_title: 'Frontend Developer', location: 'Lima Metropolitan Area', job_description: '' }))));
    assert.equal(v.IsBR, false);
    assert.equal(vagasParaPerfil([v], { Region: 'br' }).length, 0);
    assert.equal(vagasParaPerfil([v], { Region: 'intl' }).length, 1);
});

test('mesmo título em empresas diferentes não é repetição', () => {
    const a = vagaDoPost(comoPost(linhaDaVaga(item()), '1'));
    const b = vagaDoPost(comoPost(linhaDaVaga(item({ job_id: '4420009999', company_name: 'Outra' })), '2'));
    assert.equal(semRepetidas([a, b]).length, 2);
    assert.equal(semRepetidas([a, { ...a, Id: 'link-3' }]).length, 1);
});

test('front vem primeiro, para ganhar a descrição antes das outras buscas', () => {
    assert.equal(BUSCAS[0].nome, 'front-brasil');
});

test('a resposta leva a empresa', () => {
    const [v] = vagasParaPerfil([vagaDoPost(comoPost(linhaDaVaga(item())))], { Region: 'br' });
    assert.equal(v.company, 'Acme');
});

test('o custo diário tem teto: no máximo ~1280 vagas, só front com descrição', () => {
    assert.equal(BUSCAS.reduce((s, b) => s + b.max, 0), 1280);
    assert.deepEqual(BUSCAS.filter((b) => b.descricao).map((b) => b.nome), ['front-brasil']);
});
