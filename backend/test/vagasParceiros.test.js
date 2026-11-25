import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarVagaParceiro, conteudoDaVaga } from '../services/vagasParceirosLogic.js';
import { vagaDoPost, PARCEIRO } from '../services/vagasPorLink.js';

const ok = {
    titulo: 'Desenvolvedor Backend Pleno (Python)', empresa: 'Nexmuv', local: 'São Paulo/SP', modalidade: 'remoto',
    descricao: 'Python, Django, PostgreSQL. Projeto de longo prazo.', link: 'https://www.notion.so/form-exemplo',
};

test('validação: exige cargo, empresa e link https, e recusa email no texto', () => {
    assert.ok(validarVagaParceiro(ok).dados);
    assert.match(validarVagaParceiro({ ...ok, titulo: '' }).erro, /cargo/);
    assert.match(validarVagaParceiro({ ...ok, empresa: '' }).erro, /empresa/);
    assert.match(validarVagaParceiro({ ...ok, link: 'notion.so/x' }).erro, /link/);
    assert.match(validarVagaParceiro({ ...ok, link: 'http://notion.so/x' }).erro, /https/);
    assert.match(validarVagaParceiro({ ...ok, descricao: 'mande para rh@nexmuv.com.br' }).erro, /email/);
});

test('o post gravado vira vaga por link com título, empresa, link e modalidade', () => {
    const d = validarVagaParceiro(ok).dados;
    const post = { Id: 99, Source: PARCEIRO, Author: d.empresa, Url: d.link, Content: conteudoDaVaga(d), PostedAt: new Date().toISOString() };
    const v = vagaDoPost(post);
    assert.ok(v, 'virou vaga');
    assert.equal(v.JobTitle, ok.titulo);
    assert.equal(v.Company, 'Nexmuv');
    assert.equal(v.url, 'https://www.notion.so/form-exemplo');
    assert.equal(v.Parceiro, true);
    assert.equal(v.Location, 'São Paulo/SP');
    assert.ok((v.Mods || []).includes('remoto'));
});

test('título vago de parceiro ainda entra (o admin escreveu)', () => {
    const d = validarVagaParceiro({ ...ok, titulo: 'Oportunidade aberta', descricao: 'Vaga de desenvolvimento de software.' }).dados;
    const v = vagaDoPost({ Id: 1, Source: PARCEIRO, Author: d.empresa, Url: d.link, Content: conteudoDaVaga(d), PostedAt: new Date().toISOString() });
    assert.ok(v);
});
