import test from 'node:test';
import assert from 'node:assert/strict';
import { localDaVaga, foraDoLocal, vagaExclusivaPcd } from '../services/localVaga.js';
import { passesFilters } from '../services/jobsQuery.js';

const hibrida = (Location) => ({ Location, Modality: 'hibrido' });
const so = (...States) => ({ Region: 'br', States });

test('lê os formatos reais do campo Location', () => {
    const ufs = (l) => [...localDaVaga({ Location: l }).ufs].sort();
    assert.deepEqual(ufs('São Paulo/SP'), ['SP']);
    assert.deepEqual(ufs('São Paulo – SP'), ['SP']);
    assert.deepEqual(ufs('Faria Lima – São Paulo/SP'), ['SP']);
    assert.deepEqual(ufs('Campinas - São Paulo'), ['SP']);
    assert.deepEqual(ufs('Consolação, São Paulo'), ['SP']);
    assert.deepEqual(ufs('Alphaville – SP'), ['SP']);
    assert.deepEqual(ufs('Macaé - RJ'), ['RJ']);
    assert.deepEqual(ufs('Curitiba'), ['PR']);
    assert.deepEqual(ufs('SP'), ['SP']);
    assert.deepEqual(ufs('Minas Gerais'), ['MG']);
    assert.deepEqual(ufs('Brasil, SP, Fortaleza'), ['CE', 'SP']);
});

test('local que não diz o estado fica sem estado', () => {
    for (const l of ['Brasil', 'Remoto', '100% Remoto (Home Office Brasil)', 'Portugal', '', null]) {
        assert.equal(localDaVaga({ Location: l }).ufs.size, 0, String(l));
    }
});

test('híbrida e presencial de outro estado saem', () => {
    assert.equal(foraDoLocal(hibrida('Recife/PE'), so('SP')), true);
    assert.equal(foraDoLocal({ Location: 'Recife/PE', Modality: 'presencial' }, so('SP')), true);
    assert.equal(foraDoLocal(hibrida('Campinas/SP'), so('SP')), false);
    assert.equal(foraDoLocal(hibrida('Recife/PE'), so('SP', 'PE')), false);
});

test('vaga em vários estados fica se um deles foi marcado', () => {
    assert.equal(foraDoLocal(hibrida('Brasil, SP, Fortaleza'), so('CE')), false);
});

test('remota sempre fica, mesmo citando outro estado', () => {
    assert.equal(foraDoLocal({ Location: 'Recife/PE', Modality: 'remoto' }, so('SP')), false);
    assert.equal(foraDoLocal({ Location: 'Recife/PE', Modality: 'remoto,hibrido' }, so('SP')), false);
});

test('na dúvida a vaga aparece: sem local, sem modalidade ou local desconhecido', () => {
    assert.equal(foraDoLocal(hibrida(null), so('SP')), false);
    assert.equal(foraDoLocal(hibrida('Brasil'), so('SP')), false);
    assert.equal(foraDoLocal(hibrida('Itabuna'), so('SP')), false);
    assert.equal(foraDoLocal({ Location: 'Recife/PE' }, so('SP')), false);
});

test('sem estado nem cidade marcados, nada muda', () => {
    assert.equal(foraDoLocal(hibrida('Recife/PE'), { Region: 'br' }), false);
    assert.equal(foraDoLocal(hibrida('Recife/PE'), { Region: 'br', States: [], Cities: [] }), false);
    assert.equal(foraDoLocal(hibrida('Recife/PE'), null), false);
});

test('quem procura fora do Brasil não é afetado', () => {
    assert.equal(foraDoLocal(hibrida('Recife/PE'), { Region: 'intl', States: ['SP'] }), false);
});

test('cidade: vale o nome sem acento, e só ela', () => {
    const p = { Region: 'br', Cities: ['Florianópolis'] };
    assert.equal(foraDoLocal(hibrida('Florianopolis/SC'), p), false);
    assert.equal(foraDoLocal(hibrida('Joinville/SC'), p), true);
});

test('cidade: bairro e vaga que diz só o estado ficam', () => {
    assert.equal(foraDoLocal(hibrida('Pinheiros – São Paulo/SP'), { Region: 'br', Cities: ['São Paulo'] }), false);
    assert.equal(foraDoLocal(hibrida('SP'), { Region: 'br', Cities: ['Campinas'] }), false);
    assert.equal(foraDoLocal(hibrida('RJ'), { Region: 'br', Cities: ['Campinas'] }), true);
});

test('estado e cidade somam', () => {
    const p = { Region: 'br', States: ['RJ'], Cities: ['Campinas'] };
    assert.equal(foraDoLocal(hibrida('Niterói/RJ'), p), false);
    assert.equal(foraDoLocal(hibrida('Campinas/SP'), p), false);
    assert.equal(foraDoLocal(hibrida('Sorocaba/SP'), p), true);
});

test('sem o campo Location, lê a linha do post que anuncia o local', () => {
    const j = (Description) => ({ Modality: 'hibrido', Description });
    assert.equal(foraDoLocal(j('Dev Pleno 📍 Local: Recife/PE 🏢 Modelo híbrido'), so('SP')), true);
    assert.equal(foraDoLocal(j('Localização: Híbrido São Paulo – SP'), so('SP')), false);
    assert.equal(foraDoLocal(j('Empresa com sede em Recife/PE contrata'), so('SP')), false);
});

test('o campo Location vence o post', () => {
    assert.equal(foraDoLocal({ Location: 'Campinas/SP', Modality: 'hibrido', Description: '📍 Local: Recife/PE' }, so('SP')), false);
});

test('PCD: reconhece as formas reais de vaga exclusiva', () => {
    for (const d of [
        '🏢 Modelo de trabalho: Presencial ♿ Vaga exclusiva para Pessoas com Deficiência (PCD).',
        'Modelo: Híbrido ♿ Vaga Exclusiva para Pessoas com Deficiência (PCD)',
        'Oportunidade exclusiva para PCD',
        'Vaga exclusiva PcD',
        'Vaga destinada a pessoas com deficiência',
        'Processo apenas para PCDs',
    ]) assert.equal(vagaExclusivaPcd({ Description: d }), true, d);
});

test('PCD: citar não é ser exclusiva', () => {
    for (const d of [
        '1. Empresa, Desenvolvedor Pleno, Remoto, Vaga afirmativa (PcD) 2. Outra, QA Júnior, Remoto',
        'Todas as nossas vagas são abertas a pessoas com deficiência',
        'Valorizamos a diversidade: mulheres, pessoas negras, LGBTQIA+ e PcD',
        'Tem vaga afirmativa para PCD, posições de júnior a sênior',
        '♿ A oportunidade também é destinada a Pessoas com Deficiência (PCDs).',
        'As oportunidades também são destinadas a PcD.',
        '(A Blip também tem pipeline exclusivo PcD: https://lnkd.in/x)',
    ]) assert.equal(vagaExclusivaPcd({ Description: d }), false, d);
});

const vaga = {
    JobTitle: 'Desenvolvedor Backend Pleno', Email: 'rh@empresa.com.br', Area: 'backend', IsBR: true, Skills: [],
    Location: 'Recife/PE', Modality: 'hibrido', Description: 'Vaga em Recife. Vaga exclusiva para Pessoas com Deficiência (PCD).',
};

test('passesFilters: exclusiva PCD só aparece para quem pediu', () => {
    assert.equal(passesFilters(vaga, { Region: 'br' }), false);
    assert.equal(passesFilters(vaga, null), false);
    assert.equal(passesFilters(vaga, { Region: 'br', ShowPcd: true }), true);
});

test('passesFilters: respeita o estado marcado', () => {
    assert.equal(passesFilters(vaga, { Region: 'br', ShowPcd: true, States: ['SP'] }), false);
    assert.equal(passesFilters(vaga, { Region: 'br', ShowPcd: true, States: ['PE'] }), true);
});
