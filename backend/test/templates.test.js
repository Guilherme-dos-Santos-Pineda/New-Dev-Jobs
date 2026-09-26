import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail, defaultTemplate } from '../services/templates.js';

const tpl = defaultTemplate('pt');
const user = { Name: 'Ana', Email: 'ana@x.com' };
const subject = (job, profile) => renderEmail({ subjectTemplate: tpl.subject, bodyTemplate: tpl.body, user, profile, job }).subject;

test('renderEmail: título real da vaga é mantido', () => {
    assert.match(subject({ JobTitle: 'Desenvolvedor .NET', Company: 'Acme' }, { Areas: ['dev'] }), /Desenvolvedor \.NET/);
});

test('renderEmail: título genérico "Vaga" vira o cargo da área (sem "para Vaga")', () => {
    const s = subject({ JobTitle: 'Vaga', Company: 'Acme' }, { Areas: ['qa'] });
    assert.match(s, /QA/);
    assert.doesNotMatch(s, /para Vaga/i);
});

test('renderEmail: título vazio sem área usa o padrão', () => {
    assert.match(subject({ JobTitle: '', Company: 'Acme' }, {}), /Desenvolvedor/);
});

test('renderEmail: interpola empresa no assunto', () => {
    assert.match(subject({ JobTitle: 'Dev', Company: 'Acme' }, {}), /na Acme/);
});

// =========================
// Contato direto: a frase tem de sumir quando não há link
// =========================
// Regressão de produção. O template padrão trazia "estou disponível no
// {whatsapp_link} ou no {linkedin_link}" escrito à mão. Quem não preencheu
// nenhum dos dois mandava para um recrutador REAL a frase "estou disponível no
// ou no ." Medido no banco no dia do conserto: 2 perfis sem whatsapp, telefone
// nem linkedin, e o caminho de envio manual (que não exige currículo nem conta
// Google) deixou esse perfil incompleto chegar no email com muito mais
// facilidade do que antes.

const corpo = (profile) => renderEmail({
    subjectTemplate: tpl.subject, bodyTemplate: tpl.body,
    user, profile, job: { JobTitle: 'Dev', Company: 'Acme' },
});

test('sem whatsapp e sem linkedin: a frase de contato direto some inteira', () => {
    const { text, html } = corpo({});
    assert.doesNotMatch(text, /estou disponível/i);
    assert.doesNotMatch(text, /no\s+ou no/i);   // o sintoma exato do bug
    assert.doesNotMatch(html, /<p[^>]*>\s*<\/p>/); // e não deixa parágrafo vazio
});

test('sem contato nenhum: não sobra vão de linhas em branco no texto', () => {
    assert.doesNotMatch(corpo({}).text, /\n\s*\n\s*\n/);
});

test('só whatsapp: a frase aparece sem o "ou no" pendurado', () => {
    // Em texto puro o link vira "WhatsApp (url)"; no HTML vira <a>.
    const { text } = corpo({ Whatsapp: '11999998888' });
    assert.match(text, /estou disponível no WhatsApp \(https:\/\/wa\.me\/11999998888\)\./);
    assert.doesNotMatch(text, / ou no /);
});

test('só linkedin: a frase aparece com o LinkedIn', () => {
    const { text } = corpo({ Linkedin: 'https://linkedin.com/in/ana' });
    assert.match(text, /estou disponível no LinkedIn \(/);
    assert.doesNotMatch(text, / ou no /);
});

test('os dois preenchidos: a frase lista os dois', () => {
    const { text } = corpo({ Whatsapp: '11999998888', Linkedin: 'https://linkedin.com/in/ana' });
    assert.match(text, /no WhatsApp \([^)]+\) ou no LinkedIn \([^)]+\)\./);
});

test('nenhum caso deixa chave de variável crua no email', () => {
    for (const p of [{}, { Whatsapp: '11999998888' }, { Linkedin: 'https://linkedin.com/in/ana' }]) {
        assert.doesNotMatch(corpo(p).text, /\{[a-z_]+\}/);
    }
});
