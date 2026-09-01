import test from 'node:test';
import assert from 'node:assert/strict';
import {
    pareceNomeDePessoa, pareceNomeDeEmpresa, nivelPeloTitulo, linhaDaVaga, montarPost, janelaDoDia,
} from '../services/highlights.js';

// O texto gerado aqui vai para uma rede social PÚBLICA, com o nome do usuário
// embaixo. Erro que no feed é só ruído (nome de recrutador no lugar da empresa,
// senioridade lida da descrição) aqui vira dado errado sobre gente de verdade.

test('nome de pessoa nao entra no lugar da empresa', () => {
    // A extração cai no nome do AUTOR do post quando não acha empresa.
    for (const n of ['Geane Barros', 'Juliana Batista de Souza', 'Richardyson S.', 'Ana Paula Silva']) {
        assert.equal(pareceNomeDePessoa(n), true, `"${n}" deveria ser lido como pessoa`);
    }
});

test('empresa de verdade nao e confundida com pessoa', () => {
    for (const n of ['Act Digital', 'TTAX', 'Kron Digital', 'Hays', 'Tecmaster', 'SP CAPITAL', 'Zup IT']) {
        assert.equal(pareceNomeDePessoa(n), false, `"${n}" e empresa, nao pessoa`);
    }
});

test('descricao no lugar do nome da empresa e descartada', () => {
    assert.equal(pareceNomeDeEmpresa('consultoria de TI multinacional'), false);
    assert.equal(pareceNomeDeEmpresa('Act Digital'), true);
    assert.equal(pareceNomeDeEmpresa(''), false);
});

// detectLevel le titulo + DESCRICAO, e a descricao mente: um anuncio senior que
// cita "temos vaga de estagio tambem" saia rotulado como estagio. Num post
// publico isso e informacao errada assinada por nos.
test('o nivel do post sai so do titulo', () => {
    assert.equal(nivelPeloTitulo('Desenvolvedor Java Sênior'), 'senior');
    assert.equal(nivelPeloTitulo('Analista QA Junior'), 'junior');
    assert.equal(nivelPeloTitulo('Desenvolvedor(a) Node.js'), null, 'titulo sem nivel nao inventa nivel');
    assert.equal(nivelPeloTitulo('Desenvolvedor Web'), null);
});

test('a linha nao repete o nivel que ja esta no titulo', () => {
    const linha = linhaDaVaga({ title: 'Desenvolvedor Java Sênior', company: 'Act Digital', area: 'dev' });
    assert.equal(linha.match(/Sênior/g).length, 1, `"Sênior" aparece duas vezes: ${linha}`);
});

test('vaga sem empresa reconhecivel sai so com titulo e area', () => {
    assert.equal(linhaDaVaga({ title: 'Desenvolvedor(a) Frontend', company: null, area: 'dev' }),
        '• Desenvolvedor(a) Frontend — Desenvolvimento');
});

// Invariante mais importante deste arquivo: o email de contato e o unico ativo
// proprio da plataforma, e publica-lo tambem exporia contato de terceiro sem
// permissao. Ele nao pode vazar nem por acidente de template.
test('o post NUNCA contem email', () => {
    const post = montarPost([
        { title: 'Dev Backend', company: 'Act Digital', area: 'dev' },
        { title: 'QA Pleno', company: null, area: 'qa' },
    ], { total: 500 });
    assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(post), `vazou email: ${post}`);
    assert.ok(post.includes('newdevjobs.xyz'), 'o post precisa levar para o site');
    assert.ok(post.includes('Dev Backend') && post.includes('QA Pleno'));
});

test('o post diz quantas vagas ficaram de fora', () => {
    const post = montarPost([{ title: 'Dev Backend', company: 'Act', area: 'dev' }], { total: 500 });
    assert.ok(post.includes('499'), 'deveria citar as 499 restantes');
});

test('sem vaga nenhuma o post vem vazio (nada de lista vazia publicada)', () => {
    assert.equal(montarPost([], { total: 0 }), '');
});

// A lista muda por DIA, nao por request: quem copiou de manha e conferiu a tarde
// precisa ver a mesma coisa, senao acha que copiou errado.
test('a janela muda de um dia para o outro e e estavel dentro do dia', () => {
    const manha = new Date('2026-09-01T08:00:00Z');
    const noite = new Date('2026-09-01T23:00:00Z');
    const amanha = new Date('2026-09-02T08:00:00Z');
    assert.equal(janelaDoDia(manha, 120, 10), janelaDoDia(noite, 120, 10), 'nao pode mudar no mesmo dia');
    assert.notEqual(janelaDoDia(manha, 120, 10), janelaDoDia(amanha, 120, 10), 'tem de mudar no dia seguinte');
});

test('a janela nunca passa do fim da urna', () => {
    for (let d = 0; d < 40; d++) {
        const dia = new Date(Date.UTC(2026, 8, 1) + d * 86400000);
        const i = janelaDoDia(dia, 120, 10);
        assert.ok(i >= 0 && i < 120, `janela fora da urna: ${i}`);
    }
    assert.equal(janelaDoDia(new Date(), 5, 10), 0, 'urna menor que a janela comeca do zero');
});
