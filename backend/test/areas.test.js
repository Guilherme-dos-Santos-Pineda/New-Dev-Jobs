import test from 'node:test';
import assert from 'node:assert/strict';
import { expandirAreas, FAMILIA_DEV } from '../config/areas.js';
import { ALLOWED_AREAS } from '../config/profileOptions.js';
import { detectArea } from '../services/classify.js';

// =========================
// Divisão da área "dev" (30/09/2026)
// =========================
// Até aqui existia UMA área de programação: 'dev', 4714 das 7826 vagas com
// email. Um dev de front recebia vaga de back e de tudo, e a queixa real de um
// usuário foi "acho pouquíssima vaga de front-end". A categoria não existia.

test('quem escolheu "dev" continua recebendo as quatro', () => {
    // ESTE É O TESTE QUE IMPEDE O ESTRAGO GRANDE. A maioria dos perfis salvos
    // antes da divisão tem exatamente `Areas: ["dev"]`. Sem a expansão, no dia
    // do deploy essas pessoas passariam a receber ZERO vaga, porque as vagas
    // viraram frontend/backend/fullstack e nenhuma seria mais 'dev'.
    const r = expandirAreas(['dev']);
    for (const a of FAMILIA_DEV) assert.ok(r.includes(a), `faltou ${a}`);
});

test('quem escolheu "frontend" também recebe o balde genérico', () => {
    // 'dev' guarda "Desenvolvedor de Software" e "Tech Lead", que servem para
    // front, back e full. Mesmo raciocínio do 'other', que passa de propósito.
    const r = expandirAreas(['frontend']);
    assert.ok(r.includes('frontend'));
    assert.ok(r.includes('dev'));
});

test('front NÃO puxa back (e vice-versa)', () => {
    // REGRESSÃO da primeira versão: qualquer escolha da família expandia para a
    // família inteira, então escolher "front-end" continuava trazendo back-end
    // puro e o filtro não estreitava quase nada — exatamente a queixa que
    // motivou dividir a área. Medido num usuário real: trocar 'dev' por
    // 'frontend' não mudava o tamanho do feed (762 antes e depois).
    const front = expandirAreas(['frontend']);
    assert.equal(front.includes('backend'), false, 'front não pode puxar back');
    const back = expandirAreas(['backend']);
    assert.equal(back.includes('frontend'), false, 'back não pode puxar front');
});

test('fullstack entra nos dois lados, mas não puxa os dois', () => {
    // Vaga full-stack pede front E back, então serve para quem escolheu
    // qualquer um dos dois. O contrário não vale: quem quer full-stack não
    // quer necessariamente vaga de só um lado.
    assert.ok(expandirAreas(['frontend']).includes('fullstack'));
    assert.ok(expandirAreas(['backend']).includes('fullstack'));
    const full = expandirAreas(['fullstack']);
    assert.equal(full.includes('frontend'), false);
    assert.equal(full.includes('backend'), false);
});

test('área de fora da família dev não arrasta a família junto', () => {
    const r = expandirAreas(['qa']);
    assert.deepEqual(r, ['qa']);
    assert.equal(r.includes('frontend'), false);
});

test('mistura: qa + frontend traz qa e o lado do front, nada mais', () => {
    const r = new Set(expandirAreas(['qa', 'frontend']));
    assert.ok(r.has('qa'));
    assert.ok(r.has('frontend'));
    assert.ok(r.has('dev'));
    assert.equal(r.has('backend'), false);
    assert.equal(r.has('data'), false);
});

test('lista vazia continua vazia (sem filtro de área)', () => {
    // Vazio significa "sem filtro". Se virasse a família dev, quem não escolheu
    // área nenhuma passaria a receber SÓ vaga de programação.
    assert.deepEqual(expandirAreas([]), []);
    assert.deepEqual(expandirAreas(null), []);
    assert.deepEqual(expandirAreas(undefined), []);
});

test('não repete área', () => {
    const r = expandirAreas(['dev', 'frontend', 'backend']);
    assert.equal(r.length, new Set(r).size);
});

// A regra das três pontas do CLAUDE.md: classificador, UI e backend têm de
// bater. Se o backend não aceitar, o PUT /profile descarta a escolha EM
// SILÊNCIO e a pessoa passa a receber o feed inteiro sem filtro.
test('toda área nova é aceita pelo backend', () => {
    for (const a of ['frontend', 'backend', 'fullstack', 'dev']) {
        assert.ok(ALLOWED_AREAS.includes(a), `ALLOWED_AREAS não tem ${a}`);
    }
});

test('toda área que o classificador produz é escolhível (menos nontech e other)', () => {
    const produzidas = new Set();
    const titulos = [
        'Desenvolvedor Front-end', 'Desenvolvedor Java', 'Desenvolvedor Full Stack',
        'Desenvolvedor de Software', 'Analista de QA', 'Product Owner',
        'Cientista de Dados', 'UX Designer', 'DevOps Engineer',
        'Desenvolvedor React Native', 'Analista de Suporte',
    ];
    for (const t of titulos) produzidas.add(detectArea({ JobTitle: t, Skills: [] }));
    for (const a of produzidas) {
        if (a === 'nontech' || a === 'other') continue;
        assert.ok(ALLOWED_AREAS.includes(a), `classificador produz "${a}" mas o backend não aceita`);
    }
});
