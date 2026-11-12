import { test } from 'node:test';
import assert from 'node:assert/strict';
import { curriculoEmPdf, semLembretes, nomeDoAnexo } from '../services/cvPdf.js';
import { escolherVersao } from '../services/cvVersoesLogic.js';

const cv = {
    nome: 'Joana da Silva', titulo: 'Desenvolvedora Back-end', contato: 'joana@exemplo.com | São Paulo/SP',
    resumoProfissional: 'Back-end com Node.js e PostgreSQL. Reduzi o tempo das consultas [em quanto?] e cuido de integrações ✨.',
    habilidades: [{ categoria: 'Linguagens', itens: 'JavaScript, TypeScript, Python' }],
    experiencias: [{ cargo: 'Desenvolvedora', empresa: 'Acme', periodo: '2022 - atual', atividades: ['APIs para [quantos clientes?] clientes', 'Migração → PostgreSQL'], tecnologias: 'Node.js' }],
    projetos: [], formacao: [{ curso: 'Análise e Desenvolvimento de Sistemas', instituicao: 'Fatec', periodo: '2021' }],
    certificacoes: [], idiomas: [{ idioma: 'Inglês', nivel: 'intermediário' }],
};

test('o lembrete entre colchetes não vai para o recrutador', () => {
    assert.equal(semLembretes('APIs para [quantos clientes?] clientes'), 'APIs para clientes');
    assert.equal(semLembretes('Reduzi o tempo [em quanto?].'), 'Reduzi o tempo.');
    assert.equal(semLembretes('sem lembrete'), 'sem lembrete');
});

test('monta um PDF de verdade, com acento, emoji e seta sem quebrar', async () => {
    const pdf = await curriculoEmPdf(cv, { lang: 'pt' });
    assert.ok(Buffer.isBuffer(pdf));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 1000);
    const en = await curriculoEmPdf(cv, { lang: 'en' });
    assert.equal(en.subarray(0, 5).toString(), '%PDF-');
});

test('currículo longo vira mais de uma página sem lançar', async () => {
    const longo = { ...cv, experiencias: Array.from({ length: 30 }, (_, i) => ({ ...cv.experiencias[0], empresa: `Empresa ${i}` })) };
    const pdf = await curriculoEmPdf(longo);
    assert.ok(pdf.length > 3000);
});

test('nome do anexo sem acento nem caractere estranho', () => {
    assert.equal(nomeDoAnexo('Joana da Silva'), 'Curriculo - Joana da Silva.pdf');
    assert.equal(nomeDoAnexo('José Ávila / <x>'), 'Curriculo - Jose Avila x.pdf');
    assert.equal(nomeDoAnexo(''), 'Curriculo.pdf');
});

test('no envio só vale versão APROVADA do mesmo tipo e idioma', () => {
    const versoes = [
        { id: 1, area: 'backend', lang: 'pt', status: 'rascunho' },
        { id: 2, area: 'backend', lang: 'en', status: 'aprovada' },
        { id: 3, area: 'frontend', lang: 'pt', status: 'aprovada' },
    ];
    assert.equal(escolherVersao({ area: 'backend', lang: 'pt' }, versoes), null);
    assert.equal(escolherVersao({ area: 'backend', lang: 'en' }, versoes).id, 2);
    assert.equal(escolherVersao({ area: 'frontend', lang: 'pt' }, versoes).id, 3);
});
