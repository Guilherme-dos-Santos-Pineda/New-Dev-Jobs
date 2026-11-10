import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dominioRecebeEmail, enderecosSemDominio } from '../services/emailDominio.js';
import { renderEmail, empresaEhQuemPostou, DEFAULTS } from '../services/templates.js';

const erro = (code) => Object.assign(new Error(code), { code });
// DNS de mentira: cada domínio responde o que o teste mandar.
const dnsFalso = (mapa) => ({
    resolveMx: async (d) => { const r = mapa[d]?.mx; if (r instanceof Error) throw r; return r || []; },
    resolve4: async (d) => { const r = mapa[d]?.a; if (r instanceof Error) throw r; if (!r) throw erro('ENODATA'); return r; },
    resolve6: async (d) => { const r = mapa[d]?.aaaa; if (r instanceof Error) throw r; if (!r) throw erro('ENODATA'); return r; },
});

test('domínio com MX recebe email', async () => {
    assert.equal(await dominioRecebeEmail('acme-mx.com.br', dnsFalso({ 'acme-mx.com.br': { mx: [{ exchange: 'mx' }] } })), true);
});

test('domínio que não existe não recebe', async () => {
    const falso = dnsFalso({ 'flarcinsulting.com.br': { mx: erro('ENOTFOUND'), a: erro('ENOTFOUND'), aaaa: erro('ENOTFOUND') } });
    assert.equal(await dominioRecebeEmail('flarcinsulting.com.br', falso), false);
});

test('sem MX mas com endereço, o servidor ainda pode receber: passa', async () => {
    const falso = dnsFalso({ 'so-a.com.br': { mx: erro('ENODATA'), a: ['1.2.3.4'] } });
    assert.equal(await dominioRecebeEmail('so-a.com.br', falso), true);
});

test('timeout do DNS não barra: na dúvida, envia', async () => {
    const falso = dnsFalso({ 'lento.com.br': { mx: erro('ETIMEOUT'), a: erro('ETIMEOUT'), aaaa: erro('ETIMEOUT') } });
    assert.equal(await dominioRecebeEmail('lento.com.br', falso), true);
});

test('domínio mal escrito nem consulta', async () => {
    assert.equal(await dominioRecebeEmail('acme', dnsFalso({})), false);
    assert.equal(await dominioRecebeEmail('', dnsFalso({})), false);
});

test('lista com um endereço bom passa o bom', async () => {
    const falso = dnsFalso({
        'bom-lista.com': { mx: [{ exchange: 'mx' }] },
        'morto-lista.com': { mx: erro('ENOTFOUND'), a: erro('ENOTFOUND'), aaaa: erro('ENOTFOUND') },
    });
    assert.deepEqual(await enderecosSemDominio(['rh@bom-lista.com', 'rh@morto-lista.com'], falso), ['rh@morto-lista.com']);
});

const usuario = { Name: 'Ana Souza', Email: 'ana@gmail.com' };
const perfil = { Areas: ['dev', 'qa'] };
const assunto = (job) => renderEmail({ subjectTemplate: DEFAULTS.pt.subject, bodyTemplate: DEFAULTS.pt.body, user: usuario, profile: perfil, job });

test('nome de quem postou não vira empresa no assunto, mas fica no cumprimento', () => {
    const job = { JobTitle: 'QA Pleno', Company: 'Wesley Macedo', AutorNome: 'Wesley Macedo' };
    const r = assunto(job);
    assert.equal(r.subject, 'Candidatura para QA Pleno');
    assert.match(r.text, /^Olá Wesley Macedo,/);
});

test('página de empresa que posta com o próprio nome continua no assunto', () => {
    assert.equal(assunto({ JobTitle: 'QA Pleno', Company: 'Capitani Group', AutorNome: 'Capitani Group' }).subject, 'Candidatura para QA Pleno na Capitani Group');
});

test('empresa real com jeito de nome de pessoa continua no assunto', () => {
    assert.equal(empresaEhQuemPostou({ Company: 'Wilson Sons', AutorNome: 'Maria Lima' }), false);
    assert.equal(assunto({ JobTitle: 'Dev Java', Company: 'Wilson Sons', AutorNome: 'Maria Lima' }).subject, 'Candidatura para Dev Java na Wilson Sons');
});

test('título vago usa a área da vaga, não a primeira área do perfil', () => {
    assert.equal(assunto({ JobTitle: 'Vaga', Company: 'Acme', Area: 'qa' }).subject, 'Candidatura para QA na Acme');
    assert.equal(assunto({ JobTitle: 'Vaga', Company: 'Acme', Area: 'frontend' }).subject, 'Candidatura para Desenvolvedor(a) Front-end na Acme');
    assert.equal(assunto({ JobTitle: 'Vaga', Company: 'Acme' }).subject, 'Candidatura para Desenvolvedor(a) na Acme');
});
