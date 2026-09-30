import test from 'node:test';
import assert from 'node:assert/strict';
import { emailDeContatoValido, ehErroDeDestinatario, LIKE_EMAIL } from '../services/emailContato.js';

// =========================
// Email de contato da vaga
// =========================
// Regressão de produção (30/09/2026). O extrator grava telefone e link na
// coluna Email; o feed só exigia `Email <> ''`, então a vaga ia para a fila, o
// Gmail recusava, o worker chamava de falha TRANSITÓRIA e retentava por mais de
// 7 horas com a linha presa em `queued`. O painel do usuário ficou "enviando"
// sem fim. Os valores abaixo são os REAIS que estavam no banco.

test('recusa os lixos que estavam mesmo no banco', () => {
    const reais = [
        '(11) 99153-5908',              // vaga 10923
        '11 982756522',                 // vaga 11282
        'https://lnkd.in/dPdbFCkV',     // vaga 11571
        'https://abre.ai/rumo2026',
        'Gabriella -  11 976079797',
        'informado',
        'eUiAT4j2',
        '11961634418',
        '+91 9606045762',
        'Gmail',
    ];
    for (const v of reais) {
        assert.equal(emailDeContatoValido(v), false, `deveria recusar: ${v}`);
    }
});

test('aceita endereço normal', () => {
    for (const v of ['mirian.lemes@cwi.com.br', 'rh@empresa.com', 'a.b+c@sub.dominio.io']) {
        assert.equal(emailDeContatoValido(v), true, `deveria aceitar: ${v}`);
    }
});

test('aceita lista separada por vírgula (o Gmail aceita várias no To)', () => {
    assert.equal(emailDeContatoValido('selecao@dp.com.br, deise@dp.com.br'), true);
    assert.equal(emailDeContatoValido('a@x.com,b@y.com,c@z.com'), true);
});

test('lista com UMA parte ruim é recusada inteira', () => {
    // Basta uma parte inválida para o Gmail recusar a mensagem toda, então
    // aceitar "quase certo" só adiaria a mesma falha.
    assert.equal(emailDeContatoValido('ok@x.com, (11) 99999-9999'), false);
    assert.equal(emailDeContatoValido('ok@x.com, informado'), false);
});

test('vazio, nulo e não-string são recusados', () => {
    for (const v of ['', '   ', null, undefined, 42, {}, []]) {
        assert.equal(emailDeContatoValido(v), false, `deveria recusar: ${String(v)}`);
    }
});

test('recusa endereço sem TLD de letras', () => {
    assert.equal(emailDeContatoValido('rh@empresa'), false);
    assert.equal(emailDeContatoValido('rh@empresa.'), false);
    assert.equal(emailDeContatoValido('rh@empresa.123'), false);
});

test('recusa endereço com espaço ou delimitador de cabeçalho', () => {
    for (const v of ['a b@x.com', 'a@x .com', '<a@x.com>', 'a@x.com; b@y.com']) {
        assert.equal(emailDeContatoValido(v), false, `deveria recusar: ${v}`);
    }
});

// O SQL tem de ser MAIS FROUXO que o JS, nunca o contrário: SQL restritivo
// demais some com vaga boa em silêncio. Este teste trava essa direção.
test('tudo que o JS aceita também casa com o LIKE do SQL', () => {
    const casaLike = (s) => {
        const i = s.indexOf('@');
        return i > 0 && s.indexOf('.', i) > i;
    };
    assert.equal(LIKE_EMAIL, '%@%.%');
    for (const v of ['mirian.lemes@cwi.com.br', 'rh@empresa.com', 'a@x.com,b@y.com']) {
        assert.equal(emailDeContatoValido(v) && casaLike(v), true, `LIKE deveria pegar: ${v}`);
    }
});

test('erro de destinatário do Gmail é definitivo, não transitório', () => {
    // Estas duas mensagens são as que apareceram no log de produção.
    assert.equal(ehErroDeDestinatario(new Error('Recipient address required')), true);
    assert.equal(ehErroDeDestinatario(new Error('Invalid To header')), true);
    assert.equal(ehErroDeDestinatario('invalid recipient'), true);
});

test('erro de rede e 5xx continuam transitórios', () => {
    for (const e of [new Error('socket hang up'), new Error('Backend Error'), new Error('Rate Limit Exceeded'), new Error(''), null]) {
        assert.equal(ehErroDeDestinatario(e), false, `não deveria ser definitivo: ${e?.message}`);
    }
});
