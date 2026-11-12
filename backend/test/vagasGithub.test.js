import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueParaPost, linkedinDoAutor } from '../services/vagasGithubLogic.js';

const issue = (extra = {}) => ({
    number: 42, state: 'open', title: '[Remoto] Dev Back-end Júnior - Acme',
    body: 'Envie o currículo para vagas@acme.com.br', user: { login: 'acme-rh' },
    html_url: 'https://github.com/backend-br/vagas/issues/42', created_at: '2026-11-10T12:00:00Z',
    ...extra,
});

test('issue aberta com email vira post com id próprio e título na primeira linha', () => {
    const p = issueParaPost(issue(), 'backend-br/vagas');
    assert.equal(p.id, 'github:backend-br/vagas#42');
    assert.ok(p.content.startsWith('[Remoto] Dev Back-end Júnior - Acme\n'));
    assert.equal(p.postedAt.date, '2026-11-10T12:00:00Z');
    assert.equal(p.linkedinUrl, 'https://github.com/backend-br/vagas/issues/42');
});

test('sem email, fechada ou pull request não vira post', () => {
    assert.equal(issueParaPost(issue({ body: 'Candidate-se pelo link https://acme.gupy.io' }), 'r'), null);
    assert.equal(issueParaPost(issue({ state: 'closed' }), 'r'), null);
    assert.equal(issueParaPost(issue({ pull_request: {} }), 'r'), null);
    assert.equal(issueParaPost(issue({ body: null }), 'r'), null);
});

test('email só de retorno, fora de "Como se candidatar", não vira post', () => {
    // Formato real (soujava/vagas-java, 11/2026): candidatura pela página, email só para retorno.
    const agencia = '## Descrição\nJava\n\n## Como se candidatar\n\nPela página da vaga: https://ex.com/vaga\n\n## Tempo médio de feedbacks\n\nContato para retorno do processo: giovani@ex.com\n';
    assert.equal(issueParaPost(issue({ body: agencia }), 'r'), null);
    // Formato real (backend-br/vagas): email dentro da seção, com cabeçalho ###.
    const ok = '### Localização\n\nBrasil\n\n### Como se candidatar\n\nescreva para [marcos@gmail.com](mailto:marcos@gmail.com).\n\n### Confirmações\n\n- [x] ok';
    assert.ok(issueParaPost(issue({ body: ok }), 'r'));
    // Seção como a última do texto.
    assert.ok(issueParaPost(issue({ body: '## Vaga\nx\n## Como se candidatar\nmande para rh@acme.com' }), 'r'));
    // Texto livre, sem a seção: vale o email do texto.
    assert.ok(issueParaPost(issue({ body: 'Enviar sua candidatura para o e-mail pedro@consult.com.br' }), 'r'));
});

test('LinkedIn do autor só quando há um perfil de pessoa', () => {
    assert.equal(linkedinDoAutor('fale comigo https://br.linkedin.com/in/Maria-RH/ ou email'), 'https://www.linkedin.com/in/maria-rh');
    assert.equal(linkedinDoAutor('https://www.linkedin.com/in/ana e https://www.linkedin.com/in/ana?x=1'), 'https://www.linkedin.com/in/ana');
    assert.equal(linkedinDoAutor('https://linkedin.com/in/ana e https://linkedin.com/in/bia'), null);
    assert.equal(linkedinDoAutor('https://www.linkedin.com/company/acme'), null);
    assert.equal(linkedinDoAutor(''), null);
});

test('o LinkedIn achado vai no autor do post (vira recrutador monitorável)', () => {
    const p = issueParaPost(issue({ body: 'rh@acme.com https://www.linkedin.com/in/joana-tech' }), 'r');
    assert.equal(p.author.linkedinUrl, 'https://www.linkedin.com/in/joana-tech');
    assert.equal(issueParaPost(issue(), 'r').author.linkedinUrl, '');
});
