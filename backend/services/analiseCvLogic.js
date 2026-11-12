// =========================
// Análise e reescrita do currículo: a parte PURA (sem SQL nem rede), testável.
// =========================
// O prompt veio do Reprova CV (projeto do dono, Gemini 3 Flash), cujo resultado
// ele considera excelente: toda dica cita algo DAQUELE currículo e a resposta é
// um JSON com o currículo inteiro reescrito em campos. Duas mudanças ao trazer:
//   1. Lá o prompt pedia "adicione métricas quando possível". Aqui o currículo vai
//      para recrutador de verdade, então a IA NÃO inventa número, empresa, data,
//      cargo nem certificação. Onde caberia um número que a pessoa não deu, entra
//      um lembrete entre colchetes ("[quantos usuários?]") para ela preencher.
//   2. As palavras-chave vêm das vagas do feed da pessoa, não do palpite da IA.

// A análise fica GRÁTIS (decisão do dono, 11/11/2026): 2 por pessoa. O plano pago
// vai vender as versões por área, não a análise. Era 3 "durante o teste, depois
// só no pago". O valor que vale é o do Admin › Currículo IA; este é o padrão.
export const LIMITE_ANALISES = 2;
export const MAX_TEXTO_CV = 15000;
export const MIN_TEXTO_CV = 200;

const AREA_LEGIVEL = {
    frontend: 'front-end', backend: 'back-end', fullstack: 'full stack', dev: 'desenvolvimento de software',
    mobile: 'mobile', data: 'dados', devops: 'DevOps, infraestrutura e segurança', qa: 'QA e testes',
    design: 'design UX/UI', po: 'produto e projetos', suporte: 'suporte de TI', erp: 'ERP/SAP',
    adm: 'administrativo', financeiro: 'financeiro e contábil', rh: 'RH e recrutamento', engenharia: 'engenharia, indústria e manutenção', vendas: 'vendas', marketing: 'marketing', operacoes: 'operações e logística', juridico: 'jurídico',
};
const NIVEL_LEGIVEL = { estagio: 'estágio', junior: 'júnior', pleno: 'pleno', senior: 'sênior', lead: 'liderança' };

const lista = (v) => {
    if (Array.isArray(v)) return v;
    try { const p = JSON.parse(v || '[]'); return Array.isArray(p) ? p : []; } catch { return []; }
};

/** As skills que mais aparecem nas vagas do feed da pessoa: é o que o ATS dela vai procurar. */
export function palavrasDoFeed(matches, limite = 15) {
    const conta = new Map();
    for (const m of matches || []) {
        const daVaga = new Map((m.skills || []).map((x) => String(x).trim()).filter(Boolean).map((s) => [s.toLowerCase(), s]));
        for (const [k, s] of daVaga) {
            const atual = conta.get(k) || { palavra: s, n: 0 };
            atual.n += 1;
            conta.set(k, atual);
        }
    }
    return [...conta.values()].sort((a, b) => b.n - a.n || a.palavra.localeCompare(b.palavra))
        .slice(0, limite).map((x) => x.palavra);
}

export const SISTEMA = `Você é um consultor de carreira sênior, especialista em recrutamento de tecnologia no Brasil. Analise o currículo fornecido e produza uma análise PROFUNDA, ESPECÍFICA e PERSONALIZADA. Depois, REESCREVA o currículo completo com linguagem profissional e otimizada para sistemas de triagem (ATS).

REGRAS IMPORTANTES:
- NUNCA dê dicas genéricas como "use verbos de ação" ou "mantenha em uma página". Isso é óbvio demais.
- Cada dica DEVE citar algo ESPECÍFICO deste currículo (empresa, cargo, projeto, tecnologia, período).
- Seja direto, honesto e construtivo.
- Na reescrita, use verbos de ação fortes e deixe claro o impacto de cada experiência.

PROIBIDO INVENTAR (este currículo será enviado a recrutadores reais):
- NUNCA invente empresa, cargo, data, curso, certificação, tecnologia, número ou resultado que não esteja no texto.
- Métrica só se o número estiver no currículo. Onde um número ajudaria e a pessoa não deu, escreva um lembrete entre colchetes para ela preencher, por exemplo "[quantos usuários?]" ou "[em quanto tempo?]".
- Contato: copie exatamente o que está no currículo. Se faltar, deixe vazio.
- Palavra-chave que a pessoa não demonstra no texto NÃO entra nas habilidades: fica só na lista de palavras-chave, como sugestão do que estudar ou mostrar.

Escreva no mesmo idioma do currículo original.

Responda APENAS com JSON válido, neste formato:
{
  "scoreEmpregabilidade": número de 0 a 100,
  "resumoExecutivo": "2 a 3 frases sobre como este currículo se sai hoje",
  "comparacaoMercado": "como este perfil se compara a quem disputa as mesmas vagas",
  "pontosFortes": ["..."],
  "pontosFracos": ["..."],
  "dicas": ["dica específica e acionável"],
  "palavrasChaveATS": ["..."],
  "curriculoReescrito": {
    "nome": "...", "titulo": "cargo que a pessoa busca", "contato": "...", "resumoProfissional": "...",
    "habilidades": [{ "categoria": "...", "itens": "..." }],
    "experiencias": [{ "cargo": "...", "empresa": "...", "periodo": "...", "atividades": ["..."], "tecnologias": "..." }],
    "projetos": [{ "nome": "...", "descricao": ["..."], "stack": "..." }],
    "formacao": [{ "curso": "...", "instituicao": "...", "periodo": "..." }],
    "certificacoes": ["..."],
    "idiomas": [{ "idioma": "...", "nivel": "..." }]
  }
}`;

/** A mensagem do usuário: o currículo e o que a pessoa procura. */
export function mensagemDoUsuario(textoCv, perfil = {}, palavras = []) {
    const areas = lista(perfil.Areas).map((a) => AREA_LEGIVEL[a] || a);
    const niveis = lista(perfil.Levels).map((n) => NIVEL_LEGIVEL[n] || n);
    const contexto = [
        areas.length && `Área que a pessoa procura: ${areas.join(', ')}.`,
        niveis.length && `Nível que procura: ${niveis.join(', ')}.`,
        palavras.length && `Palavras-chave que mais aparecem nas vagas que a pessoa recebe: ${palavras.join(', ')}.`,
    ].filter(Boolean).join('\n');
    return `${contexto ? `${contexto}\n\n` : ''}Analise este currículo em profundidade e reescreva-o completo:\n\n${String(textoCv).slice(0, MAX_TEXTO_CV)}`;
}

const texto = (v, max = 2000) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));
const textos = (v, maxItens = 12, max = 600) => (Array.isArray(v) ? v.map((x) => texto(x, max)).filter(Boolean).slice(0, maxItens) : []);
const objetos = (v, campos, maxItens = 15) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object').slice(0, maxItens).map((x) => {
    const o = {};
    for (const [c, tipo] of Object.entries(campos)) o[c] = tipo === 'lista' ? textos(x[c], 12, 600) : texto(x[c], 400);
    return o;
}) : []);

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Lê a resposta da IA: tolera texto em volta, corta tamanhos e marca quais palavras-chave a pessoa já tem. */
export function lerResposta(conteudo, textoCv = '') {
    const bruto = String(conteudo || '');
    const achado = bruto.match(/\{[\s\S]*\}/);
    if (!achado) return null;
    let p;
    try { p = JSON.parse(achado[0]); } catch {
        try { p = JSON.parse(achado[0].replace(/[\u0000-\u001F\u007F]/g, ' ')); } catch { return null; }
    }
    const cv = p.curriculoReescrito && typeof p.curriculoReescrito === 'object' ? p.curriculoReescrito : {};
    const reescrito = {
        nome: texto(cv.nome, 120), titulo: texto(cv.titulo, 160), contato: texto(cv.contato, 400),
        resumoProfissional: texto(cv.resumoProfissional, 1500),
        habilidades: objetos(cv.habilidades, { categoria: 't', itens: 't' }),
        experiencias: objetos(cv.experiencias, { cargo: 't', empresa: 't', periodo: 't', atividades: 'lista', tecnologias: 't' }),
        projetos: objetos(cv.projetos, { nome: 't', descricao: 'lista', stack: 't' }),
        formacao: objetos(cv.formacao, { curso: 't', instituicao: 't', periodo: 't' }),
        certificacoes: textos(cv.certificacoes, 15, 200),
        idiomas: objetos(cv.idiomas, { idioma: 't', nivel: 't' }, 8),
    };
    if (!reescrito.resumoProfissional && !reescrito.experiencias.length && !reescrito.formacao.length) return null;

    const original = semAcento(textoCv);
    const score = Math.round(Number(p.scoreEmpregabilidade));
    return {
        score: Number.isFinite(score) ? Math.min(100, Math.max(0, score)) : null,
        resumoExecutivo: texto(p.resumoExecutivo, 1000),
        comparacaoMercado: texto(p.comparacaoMercado, 1000),
        pontosFortes: textos(p.pontosFortes, 8),
        pontosFracos: textos(p.pontosFracos, 8),
        dicas: textos(p.dicas, 10),
        // "Já tem" é conferido no texto ORIGINAL, não no reescrito: é o que o ATS lê hoje.
        palavrasChave: textos(p.palavrasChaveATS, 20, 60).map((palavra) => ({ palavra, temNoCurriculo: original.includes(semAcento(palavra)) })),
        curriculo: reescrito,
    };
}

/**
 * Quantas análises a pessoa ainda pode fazer. Admin não tem limite.
 * `limite` vem do controle do admin (padrão LIMITE_ANALISES) e `extras` são as
 * análises a mais que o admin deu àquela pessoa. Bloqueado = zero.
 */
export function analisesRestantes(usadas, { admin = false, limite = LIMITE_ANALISES, extras = 0, bloqueado = false } = {}) {
    if (admin) return Infinity;
    if (bloqueado) return 0;
    return Math.max(0, (Number(limite) || 0) + (Number(extras) || 0) - (Number(usadas) || 0));
}

export const LIMITE_MAXIMO = 50;
export const EXTRAS_MAXIMO = 50;

/**
 * O controle global gravado em AppSettings('analiseCv'). Valor ausente ou torto
 * vale o padrão (ligada, LIMITE_ANALISES): a tabela pode nem existir ainda.
 */
export function lerControle(valor) {
    const v = valor && typeof valor === 'object' ? valor : {};
    const limite = Number.isInteger(v.limite) ? Math.min(LIMITE_MAXIMO, Math.max(0, v.limite)) : LIMITE_ANALISES;
    // versoesAtivas: a aba "Um currículo por tipo de vaga" e o envio com IA (cvVersoes.js).
    // Chave separada da análise: o dono quer desligar uma sem a outra (11/11/2026).
    return { ativa: v.ativa !== false, limite, versoesAtivas: v.versoesAtivas !== false };
}

/**
 * Quem pode ver e usar a ferramenta. Desligada vale para todos MENOS o admin:
 * o dono precisa testar uma mudança de prompt antes de religar para os outros.
 * O bloqueio individual não pega admin pelo mesmo motivo.
 */
export function acessoLiberado({ ativa = true, bloqueado = false, admin = false } = {}) {
    if (admin) return true;
    return ativa && !bloqueado;
}
