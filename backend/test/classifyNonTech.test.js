import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectArea } from '../services/classify.js';
import { passesFilters } from '../services/jobsQuery.js';
import { computeMatch } from '../services/matching.js';

const vaga = (JobTitle, Skills = []) => ({ JobTitle, Skills, Email: 'r@empresa.com.br', Description: '' });

// =========================================================================
// Regressão: vaga de outra profissão aparecia no feed de dev.
//
// detectArea devolvia 'other' para tudo que não reconhecia, e passesFilters
// deixava 'other' passar SEMPRE — a intenção era não perder vaga boa mal
// classificada, mas o efeito era liberar todo o ruído do scraper, que lê posts
// de recrutador anunciando qualquer profissão. Caso relatado pelo dono:
// "Assistente Operacional de Logística" no feed de um desenvolvedor.
// =========================================================================

test('nontech: profissões de fora de tech são reconhecidas', () => {
    const fora = [
        'Assistente Operacional de Logística', 'Analista de RH', 'Analista Contábil',
        'Analista Fiscal Pleno', 'Analista de Compras', 'Analista de Licitações',
        'Analista de Facilities', 'Analista de Eventos', 'VIDEOMAKER', 'Psicólogo(a)',
        'Coordenador de Custos Industriais', 'Representante Comercial', 'Advogado Pleno',
        'Enfermeiro do Trabalho', 'Engenheiro Civil Sênior', 'Analista de Marketing Sênior',
    ];
    for (const t of fora) {
        assert.equal(detectArea(vaga(t)), 'nontech', `"${t}" deveria ser nontech`);
    }
});

test('nontech é barrado no feed mesmo SEM perfil preenchido', () => {
    // Vem antes do `if (!profile)`: quem ainda não configurou nada também não
    // deve ver vaga de logística num site de vagas de tecnologia.
    assert.equal(passesFilters(vaga('Assistente Operacional de Logística'), null), false);
    assert.equal(passesFilters(vaga('Analista de RH'), undefined), false);
});

test('nontech é barrado mesmo sem filtro de área declarado', () => {
    // O filtro de área só agia quando o usuário escolhia áreas. O ruído de outra
    // profissão não pode depender disso.
    const perfil = { Region: 'br', Areas: [], Skills: ['javascript'] };
    assert.equal(passesFilters(vaga('Analista de Compras'), perfil), false);
    assert.equal(passesFilters(vaga('Desenvolvedor Node.js'), perfil), true);
});

test('nontech nunca pontua alto, mesmo na visão "ignorar filtros"', () => {
    // passesFilters não roda naquela tela; a penalidade de área é a segunda linha
    // de defesa. Sem ela, coincidência de palavra na descrição inflaria o score.
    const perfil = { Skills: ['excel', 'sql'], Areas: [], Levels: [] };
    const m = computeMatch(perfil, { ...vaga('Analista de Compras'), Description: 'excel e sql avançado' });
    assert.equal(m.area, 'nontech');
    assert.equal(m.areaMismatch, true);
    assert.ok(m.score <= 30, `score foi ${m.score}, deveria ser no máximo 30`);
});

// =========================================================================
// O outro lado: vagas de tech que caíam em 'other' e seriam perdidas se o
// tratamento fosse simplesmente "bloquear tudo que não classifica".
// Todos os títulos abaixo são reais, tirados da base de produção.
// =========================================================================

test('tech que antes caía em other agora é classificada', () => {
    const esperado = {
        'Tech Lead': 'dev',
        'Arquiteto de Software': 'dev',
        'Analista de Sistemas Pleno': 'dev',
        'DBA SQL Server - SENIOR': 'data',
        'Administrador de Banco de Dados (DBA) Senior': 'data',
        'Agile Coach': 'po',
        'Agile Master Senior': 'po',
        'Analista de Service Desk / Help Desk': 'suporte',
        'Analista de Suporte N2 Pleno': 'suporte',
        'Analista de TI I': 'suporte',
        'Técnico em Informática – Hardware': 'suporte',
    };
    for (const [titulo, area] of Object.entries(esperado)) {
        assert.equal(detectArea(vaga(titulo)), area, `"${titulo}"`);
    }
});

test('tech vence o desempate: título híbrido fica com a área técnica', () => {
    // NONTECH é testado por último de propósito. "Analista de Sistemas Comercial"
    // contém "comercial", mas é vaga de tecnologia.
    assert.equal(detectArea(vaga('Analista de Sistemas Comercial')), 'dev');
    assert.equal(detectArea(vaga('Desenvolvedor para área de Compras')), 'dev');
});

test('classificação existente não regrediu', () => {
    const esperado = {
        'QA Engineer': 'qa', 'Automation QA Engineer': 'qa', 'Manual Tester': 'qa',
        'iOS Developer': 'mobile', 'React Native Developer': 'mobile',
        'DevOps Engineer': 'devops', 'Site Reliability Engineer': 'devops',
        'Cientista de Dados': 'data', 'Product Owner': 'po',
        'Desenvolvedor Full Stack': 'dev', 'Senior Software Engineer': 'dev',
    };
    for (const [titulo, area] of Object.entries(esperado)) {
        assert.equal(detectArea(vaga(titulo)), area, `"${titulo}"`);
    }
});

test('título vago continua em other (não vira nontech por engano)', () => {
    // Vaga boa pode ter título ruim; o corpo do anúncio é que diz. Bloquear estes
    // custaria candidaturas reais, então seguem passando.
    for (const t of ['Vaga', 'Analista Júnior', 'Oportunidade', 'Estamos contratando']) {
        assert.equal(detectArea(vaga(t)), 'other', `"${t}"`);
    }
    assert.equal(passesFilters(vaga('Vaga'), { Region: 'br', Areas: ['dev'] }), true);
});
