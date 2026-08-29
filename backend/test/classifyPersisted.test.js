import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyJob, CLASSIFY_VERSION, detectArea, detectLevel, detectModality, jobIsBR } from '../services/classify.js';
import { passesFilters } from '../services/jobsQuery.js';

// As colunas "Area"/"Level"/"Mods"/"IsBR" de "Jobs" guardam o resultado de
// classifyJob, e o SQL de getMatches filtra POR ELAS. Se classifyJob divergir das
// funções que passesFilters usa em JS, o banco passa a esconder vaga que o filtro
// autoritativo aprovaria — e o sintoma é vaga sumindo do feed sem erro nenhum.
test('classifyJob = as mesmas funções que passesFilters usa', () => {
    const vagas = [
        { JobTitle: 'Desenvolvedor Backend Node.js Sênior', Description: 'Vaga 100% remota em São Paulo', Skills: ['node', 'sql'], Modality: 'remoto', Location: 'São Paulo', Email: 'rh@empresa.com.br' },
        { JobTitle: 'Assistente Operacional de Logística', Description: 'Atuar no centro de distribuição', Skills: ['.NET'], Modality: null, Location: 'Guarulhos', Email: 'vagas@log.com' },
        { JobTitle: 'Vaga', Description: 'Buscamos alguém com React e TypeScript', Skills: [], Modality: 'híbrido', Location: '', Email: 'jobs@x.io' },
        { JobTitle: 'QA Engineer Pleno', Description: 'Testes automatizados, presencial', Skills: ['cypress'], Modality: '', Location: 'Remote', Email: 'hr@acme.com' },
    ];
    for (const v of vagas) {
        const c = classifyJob(v);
        assert.equal(c.area, detectArea(v), `area divergiu em "${v.JobTitle}"`);
        assert.equal(c.level, detectLevel(`${v.JobTitle} ${v.Description}`), `level divergiu em "${v.JobTitle}"`);
        assert.deepEqual(c.mods, detectModality(v), `mods divergiu em "${v.JobTitle}"`);
        assert.equal(c.isBR, jobIsBR(v), `isBR divergiu em "${v.JobTitle}"`);
        assert.equal(c.version, CLASSIFY_VERSION);
    }
});

test('CLASSIFY_VERSION é inteiro positivo (o reclassificador compara com ele)', () => {
    assert.ok(Number.isInteger(CLASSIFY_VERSION) && CLASSIFY_VERSION > 0);
});

// O pré-filtro do SQL usa `Area <> 'nontech'`. Este teste trava a outra ponta:
// nontech continua barrado em JS mesmo sem perfil configurado.
test('vaga de outra profissão fica fora com ou sem perfil', () => {
    const logistica = { JobTitle: 'Assistente Operacional de Logística', Description: 'CD', Skills: ['.NET'], Email: 'a@b.com.br' };
    assert.equal(classifyJob(logistica).area, 'nontech');
    assert.equal(passesFilters(logistica, null), false);
    assert.equal(passesFilters(logistica, { Region: 'br', Areas: ['dev'] }), false);
});

// O SQL manda `Mods is null or jsonb_exists_any(...)`; o JS precisa concordar que
// "não deu para afirmar a modalidade" PASSA. 54% da base não tem o campo — barrar
// as indefinidas esconderia metade das vagas boas.
test('modalidade indefinida passa nos dois lados', () => {
    const semModalidade = { JobTitle: 'Dev Python', Description: 'Vaga de desenvolvedor em Curitiba', Skills: ['python'], Email: 'x@y.com.br' };
    assert.equal(classifyJob(semModalidade).mods, null);
    assert.equal(passesFilters(semModalidade, { Region: 'br', Modalities: ['remoto'] }), true);
});
