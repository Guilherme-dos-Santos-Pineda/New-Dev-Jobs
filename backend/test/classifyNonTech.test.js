import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectArea, detectModality } from '../services/classify.js';
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
        // A familia dev virou quatro em 30/09/2026; 'dev' e a sobra generica.
        'Desenvolvedor Full Stack': 'fullstack', 'Senior Software Engineer': 'dev',
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

// =========================================================================
// Regressão: skill alucinada sequestrava a classificação.
//
// A extração erra feio em vaga que não é de tech. Casos reais da base:
// "Assistente Operacional" (logística) com [".NET"], "Assistente de RH" com
// ["Go"]. Como detectArea montava `título + skills` com peso igual, UMA skill
// inventada bastava para a vaga de logística virar 'dev' e entrar no feed.
// =========================================================================

test('skill inventada não sobrepõe um título de outra profissão', () => {
    assert.equal(detectArea({ JobTitle: 'Assistente Operacional', Skills: ['.NET'] }), 'nontech');
    assert.equal(detectArea({ JobTitle: 'Assistente de RH', Skills: ['Go'] }), 'nontech');
    assert.equal(detectArea({ JobTitle: 'Assistente de Marketing', Skills: ['Canva', 'Excel'] }), 'nontech');
    assert.equal(detectArea({ JobTitle: 'Consultor(a) Comercial, Assistente Fiscal', Skills: ['REST', 'Go'] }), 'nontech');
});

test('título vago ainda usa as skills — é o único sinal que resta', () => {
    assert.equal(detectArea({ JobTitle: 'Vaga', Skills: ['React', 'Node'] }), 'frontend');
    assert.equal(detectArea({ JobTitle: 'Estamos contratando', Skills: ['Kubernetes'] }), 'devops');
});

test('prefixo de cargo é reconhecido, não só "analista de X"', () => {
    for (const t of ['Assistente de RH', 'Auxiliar Operacional', 'Coordenador Operacional',
        'Assistente Departamento Pessoal', 'Assistente Administrativo', 'Analista de Eventos']) {
        assert.equal(detectArea({ JobTitle: t, Skills: [] }), 'nontech', `"${t}"`);
    }
    // ...e "de TI" com qualquer prefixo continua sendo tech
    for (const t of ['Assistente de TI', 'Auxiliar de TI', 'Analista de TI']) {
        assert.equal(detectArea({ JobTitle: t, Skills: [] }), 'suporte', `"${t}"`);
    }
});

// =========================================================================
// Regressão: o filtro de MODALIDADE não existia.
//
// "Modalities" era salvo no perfil e nunca lido por passesFilters nem por
// computeMatch. O usuário marcava "home office" e continuava recebendo vaga
// presencial — filtro decorativo, que corrói a confiança em todos os outros.
// =========================================================================

test('detectModality: normaliza os valores sujos da base', () => {
    assert.deepEqual(detectModality({ Modality: 'remoto' }), ['remoto']);
    assert.deepEqual(detectModality({ Modality: 'remote' }), ['remoto']);
    assert.deepEqual(detectModality({ Modality: 'híbrido' }), ['hibrido']);
    assert.deepEqual(detectModality({ Modality: 'presencial' }), ['presencial']);
    // valor múltiplo conta como as duas coisas
    assert.deepEqual(detectModality({ Modality: 'remoto, hibrido' }).sort(), ['hibrido', 'remoto']);
    // "PJ" não é modalidade
    assert.equal(detectModality({ Modality: 'PJ' }), null);
});

test('detectModality: cai no texto quando o campo está vazio (54% da base)', () => {
    assert.deepEqual(detectModality({ Description: 'Vaga 100% remoto para todo o Brasil' }), ['remoto']);
    assert.deepEqual(detectModality({ Description: 'Trabalho em home office' }), ['remoto']);
    // híbrido antes de remoto: "híbrido com 2 dias remotos" não é remoto puro
    assert.deepEqual(detectModality({ Description: 'Modelo híbrido, 2 dias remotos por semana' }), ['hibrido']);
    assert.equal(detectModality({ Description: 'Vaga para pessoa desenvolvedora' }), null);
});

test('quem escolheu remoto não recebe vaga presencial', () => {
    const perfil = { Region: 'br', Modalities: ['remoto'], Areas: [] };
    const base = { JobTitle: 'Desenvolvedor Java', Email: 'r@x.com.br', Description: 'vaga no Brasil' };
    assert.equal(passesFilters({ ...base, Modality: 'presencial' }, perfil), false);
    assert.equal(passesFilters({ ...base, Modality: 'remoto' }, perfil), true);
    assert.equal(passesFilters({ ...base, Modality: 'remoto, hibrido' }, perfil), true);
});

test('vaga sem modalidade identificável PASSA (metade da base não tem o campo)', () => {
    // Bloquear as indefinidas esconderia metade das vagas boas para punir uma
    // minoria de ruins. A dúvida joga a favor do usuário ver a vaga.
    const perfil = { Region: 'br', Modalities: ['remoto'], Areas: [] };
    const semInfo = { JobTitle: 'Desenvolvedor Java', Email: 'r@x.com.br', Description: 'vaga no Brasil' };
    assert.equal(passesFilters(semInfo, perfil), true);
});

test('sem filtro de modalidade declarado, nada é barrado por modalidade', () => {
    const perfil = { Region: 'br', Modalities: [], Areas: [] };
    const base = { JobTitle: 'Desenvolvedor Java', Email: 'r@x.com.br', Description: 'vaga no Brasil' };
    assert.equal(passesFilters({ ...base, Modality: 'presencial' }, perfil), true);
});

// Primeiro run do monitoramento novo (12/10/2026): estes títulos reais caíam em
// 'other', que passa no feed de propósito, e chegavam a quem procura vaga de dev.
test('nontech: cargos que vazavam como other no monitoramento', () => {
    const fora = [
        'Auxiliar de Exportação', 'Jovem Aprendiz', 'Captador(a) de Leads',
        'BDR – BUSINESS DEVELOPMENT REPRESENTATIVE', 'Coordenador(a) de Transporte',
    ];
    for (const t of fora) {
        assert.equal(detectArea(vaga(t)), 'nontech', `"${t}" deveria ser nontech`);
    }
    // e quem é de tech continua de tech
    assert.notEqual(detectArea(vaga('Desenvolvedor(a) Júnior - Integrações')), 'nontech');
    assert.notEqual(detectArea(vaga('Engenheiro de Sistemas .NET / Azure Pleno/Sênior')), 'nontech');
});

// "(a)" no meio do cargo escondia a área: "Engenheiro(a) de Dados" não casava
// com a regra de dados e, com "Importação" no título, virava nontech.
test('area: marca de gênero entre parênteses não esconde o cargo', () => {
    assert.equal(detectArea(vaga('Engenheiro(a) de Dados - Importacao & Integracoes')), 'data');
    assert.equal(detectArea(vaga('Engenheiro(a) de Dados')), detectArea(vaga('Engenheiro de Dados')));
});

// =========================================================================
// Título CLARO que não é de tech sai do feed; 'other' fica só para título vago.
//
// Medido em 25/10/2026: das ~1150 vagas do monitoramento novo, 510 caíram em
// 'other' (que passa no feed) e eram quase todas de outra profissão. E o passo
// das skills rodava para qualquer título não reconhecido, não só os vagos:
// "Assistente Financeiro" virava 'data' porque a IA listou Power BI.
// =========================================================================
test('título claro de outra profissão vira nontech, mesmo fora da lista', () => {
    for (const t of ['Esteticista', 'Vigia Noturno', 'Soldador', 'Accountant', 'Payroll Specialist', 'Orçamentista', 'Mecânico Automotivo']) {
        assert.equal(detectArea(vaga(t)), 'nontech', `"${t}"`);
    }
});

test('skills só decidem quando o título é vago', () => {
    const comSkills = (JobTitle) => ({ JobTitle, Skills: ['Power BI', 'Excel', 'SQL'], Email: 'r@x.com.br', Description: '' });
    assert.equal(detectArea(comSkills('Assistente Financeiro')), 'nontech');
    assert.equal(detectArea(comSkills('Vaga')), 'data');
});

test('carreiras de TI que não são dev continuam no feed, cada uma na sua área', () => {
    const casos = {
        'Consultor SAP SD Sênior': 'erp', 'Senior Salesforce Developer': 'erp', 'Consultor TOTVS Protheus': 'erp',
        'Analista de Segurança da Informação': 'devops', 'Analista de Redes': 'devops', 'Windows Server Administrator': 'devops',
        'Gerente de Projetos': 'po', 'Business Analyst': 'po',
        'Técnico de Suporte em TI N1': 'suporte', 'Arquiteto(a) de Soluções': 'dev', 'Technical Lead': 'dev',
    };
    for (const [t, area] of Object.entries(casos)) assert.equal(detectArea(vaga(t)), area, `"${t}"`);
});

test('nuvem genérica não rouba vaga de dev', () => {
    assert.equal(detectArea(vaga('Desenvolvedor Java AWS')), 'backend');
    assert.equal(detectArea(vaga('Desenvolvedor Front-end React e Salesforce Marketing Cloud')), 'frontend');
    assert.equal(detectArea(vaga('Redes Sociais')), 'nontech');
});

// País: post em espanhol que citava "Brasil" numa lista passava como BR, e
// vagas de Guadalajara e Costa Rica chegavam ao feed (25/10/2026).
test('vaga de fora do Brasil não passa como BR', async () => {
    const { jobIsBR } = await import('../services/classify.js');
    assert.equal(jobIsBR({ Email: 'rh@horizonte.com.mx', Location: 'Guadalajara', Description: 'Vaga no Brasil e México' }), false);
    assert.equal(jobIsBR({ Email: 'rh@infotree.com', Location: 'Escazú, Costa Rica', Description: '' }), false);
    assert.equal(jobIsBR({ Email: 'rh@x.com', Location: '', Description: 'Ofrecemos sueldo competitivo. Experiencia de 3 años de trabajo con Java.' }), false);
    // e o que é brasileiro continua
    assert.equal(jobIsBR({ Email: 'vagas@runtalent.it', Location: 'São Paulo/SP', Description: '' }), true);
    assert.equal(jobIsBR({ Email: 'a@vagas.abler.in', Location: 'Blumenau/SC', Description: '' }), true);
    assert.equal(jobIsBR({ Email: 'a@mazza.tech', Location: 'Av. Faria Lima', Description: 'Vaga de desenvolvedor, experiência com currículo' }), true);
});

// =========================================================================
// Revisão vaga a vaga do feed (25/10/2026), casos reais.
// =========================================================================
test('indústria que não é software sai, mesmo com "engineer" ou "qualidade"', () => {
    for (const t of ['Field Engineer I - FLD (Fluidos de Perfuração e Completação)', 'Offshore Maintenance Engineer',
        'Engenheiro(a) de Qualidade Offshore I', 'Analista de Desenvolvimento Organizacional - DHO',
        'Analista de Qualidade', 'Analista de Qualidade Pleno', 'Designer Gráfico', 'Analista de Suporte Fiscal I']) {
        assert.equal(detectArea(vaga(t)), 'nontech', `"${t}"`);
    }
    // e o que é software continua
    assert.equal(detectArea(vaga('Engenheiro de Software Automotivo')), 'dev');
    assert.equal(detectArea(vaga('Analista de QA')), 'qa');
    assert.equal(detectArea(vaga('Engenheiro de Qualidade / Testador Manual')), 'qa');
});

test('título vago: o post decide, e skill só conta se estiver escrita nele', () => {
    const v = (Description, Skills = []) => ({ JobTitle: 'Vaga', Skills, Email: 'r@x.com.br', Description });
    // a IA listou .NET, Go e Rust num post de bobinador e vendas
    assert.equal(detectArea(v('Oportunidade para Bobinador(a). Consultor(a) de Vendas e Marketing.', ['.NET', 'Go', 'Rust'])), 'nontech');
    assert.equal(detectArea(v('OPORTUNIDADES: MOTORISTA - CNH B. Conduzir o veículo de entrega.', ['Go'])), 'nontech');
    // post de TI sem skill confirmada: área indefinida, mas continua no feed
    assert.notEqual(detectArea(v('Vaga para Analista de Suporte Júnior (Remoto). Envie seu currículo.')), 'nontech');
    assert.equal(detectArea(v('#VagasTI: buscamos dev com Python e Django', ['Python', 'Rust'])), 'backend');
    // sem post não há o que conferir: segue passando
    assert.equal(detectArea({ JobTitle: 'Vaga', Skills: [] }), 'other');
});

test('título com vários cargos não é descartado só porque um deles é designer', () => {
    assert.equal(detectArea(vaga('Angular / React Developer Intern, Graphic Designer Intern')), 'frontend');
    assert.equal(detectArea({ JobTitle: 'Designer UX/UI Pleno', Skills: [], Description: '' }), 'design');
});

// Nível vem do título; a descrição só decide quando o título não diz nada.
test('nível: o título manda sobre a descrição', async () => {
    const { nivelDaVaga } = await import('../services/classify.js');
    assert.equal(nivelDaVaga({ JobTitle: 'Consultor SAP SD Sênior', Description: 'Temos também vaga de estagiário.' }), 'senior');
    assert.equal(nivelDaVaga({ JobTitle: 'Estágio em Desenvolvimento Front-end', Description: 'Você vai aprender com devs sênior.' }), 'estagio');
    assert.equal(nivelDaVaga({ JobTitle: 'Desenvolvedor React', Description: 'Vaga de estágio, 6h por dia.' }), 'estagio');
});

test('estágio: "Estágio em TI" fica no feed, curadoria não vira estágio, vaga encerrada sai', async () => {
    const { nivelDaVaga } = await import('../services/classify.js');
    assert.equal(detectArea(vaga('Estágio em TI')), 'suporte');
    assert.equal(detectArea(vaga('Estágio em T.I.')), 'suporte');
    const curadoria = 'Curadoria de vagas da semana: ' + 'Dev Java, Dev Python, Analista SAP, '.repeat(10) + 'e uma de estágio.';
    assert.equal(nivelDaVaga({ JobTitle: 'Salesforce Developer', Description: curadoria }), null);
    assert.equal(nivelDaVaga({ JobTitle: 'Vaga', Description: 'VAGA DE ESTÁGIO em suporte técnico' }), 'estagio');
    assert.equal(detectArea({ JobTitle: 'Estágio em Desenvolvimento', Skills: [], Description: '**PROCESSO SELETIVO ENCERRADO** Vaga de estágio' }), 'nontech');
});
