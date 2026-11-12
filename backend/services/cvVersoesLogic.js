// =========================
// Versões do currículo por área: a parte PURA (sem SQL nem rede), testável.
// =========================
// Ideia do dono (11/11/2026): vagas parecidas reaproveitam o mesmo currículo
// adaptado. A IA cria UMA versão por área e idioma; a pessoa aprova; os envios
// seguintes só escolhem a versão pela área e pelo idioma da vaga, sem IA.
import { lerResposta } from './analiseCvLogic.js';

export const MAX_VERSOES = 8;
export const VAGAS_DE_EXEMPLO = 4;

export const AREA_LEGIVEL = {
    frontend: 'Front-end', backend: 'Back-end', fullstack: 'Full-stack', dev: 'Desenvolvimento',
    mobile: 'Mobile', data: 'Dados', devops: 'DevOps e infraestrutura', qa: 'QA e testes',
    design: 'Design UX/UI', po: 'Produto e projetos', suporte: 'Suporte de TI', erp: 'ERP/SAP',
    adm: 'Administrativo', financeiro: 'Financeiro', rh: 'RH', engenharia: 'Engenharia', vendas: 'Vendas', marketing: 'Marketing', operacoes: 'Operações', juridico: 'Jurídico',
};

/**
 * Os tipos de vaga do feed da pessoa: área + idioma, com quantas vagas e as de
 * maior match como exemplo. Área vaga ("other") ou sem área não vira versão.
 * `idiomaDe(match)` vem de fora (idiomaDaVaga), para este arquivo não depender do classificador.
 */
export function gruposDoFeed(matches, idiomaDe, limite = MAX_VERSOES) {
    const grupos = new Map();
    for (const m of matches || []) {
        if (!m?.area || m.area === 'other' || m.area === 'nontech') continue;
        const lang = idiomaDe(m) === 'en' ? 'en' : 'pt';
        const chave = `${m.area}:${lang}`;
        const g = grupos.get(chave) || { area: m.area, lang, vagas: 0, exemplos: [] };
        g.vagas += 1;
        g.exemplos.push(m);
        grupos.set(chave, g);
    }
    return [...grupos.values()]
        .sort((a, b) => b.vagas - a.vagas)
        .slice(0, limite)
        .map((g) => ({
            ...g,
            exemplos: g.exemplos.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0)).slice(0, VAGAS_DE_EXEMPLO)
                .map((m) => ({ id: m.id, titulo: m.title, empresa: m.company, skills: (m.skills || []).slice(0, 12), descricao: String(m.description || '').slice(0, 600) })),
        }));
}

/** A versão que vai num envio: a aprovada da mesma área e idioma; senão nenhuma (vai o original). */
export function escolherVersao(vaga, versoes) {
    const lang = vaga?.lang === 'en' ? 'en' : 'pt';
    return (versoes || []).find((v) => v.status === 'aprovada' && v.area === vaga?.area && v.lang === lang) || null;
}

export const SISTEMA_VERSAO = `Você é um consultor de carreira sênior, especialista em recrutamento de tecnologia no Brasil. Sua tarefa é ADAPTAR um currículo para um TIPO de vaga, a partir de exemplos reais dessas vagas.

O QUE FAZER:
- Reordene e destaque as experiências, projetos e habilidades que mais importam para essas vagas.
- Resuma ou tire o que não ajuda nesse tipo de vaga (mas nunca apague a experiência inteira de um emprego: o recrutador vê buraco na linha do tempo).
- Escreva o resumo profissional voltado para esse tipo de vaga.
- Use as palavras das vagas SÓ quando a pessoa demonstra aquilo no currículo.

PROIBIDO INVENTAR (este currículo vai para recrutadores reais):
- NUNCA invente empresa, cargo, data, curso, certificação, tecnologia, número ou resultado que não esteja no texto.
- Esta versão vai ANEXADA direto aos recrutadores, sem a pessoa editar: NÃO deixe lacunas nem lembretes entre colchetes. Onde um número ajudaria e a pessoa não deu, escreva a frase sem número.
- Contato: copie exatamente o que está no currículo.
- Traduzir NÃO é inventar: se o idioma pedido for inglês, traduza fielmente.

Responda APENAS com JSON válido:
{
  "mudancas": ["o que você mudou e por quê, em frases curtas (3 a 6 itens)"],
  "curriculoReescrito": {
    "nome": "...", "titulo": "...", "contato": "...", "resumoProfissional": "...",
    "habilidades": [{ "categoria": "...", "itens": "..." }],
    "experiencias": [{ "cargo": "...", "empresa": "...", "periodo": "...", "atividades": ["..."], "tecnologias": "..." }],
    "projetos": [{ "nome": "...", "descricao": ["..."], "stack": "..." }],
    "formacao": [{ "curso": "...", "instituicao": "...", "periodo": "..." }],
    "certificacoes": ["..."],
    "idiomas": [{ "idioma": "...", "nivel": "..." }]
  }
}`;

export function mensagemVersao(textoCv, { area, lang, exemplos = [] }) {
    const vagas = exemplos.map((v, i) => `Vaga ${i + 1}: ${v.titulo}${v.empresa ? ` (${v.empresa})` : ''}\nSkills: ${v.skills.join(', ') || 'não informadas'}\n${v.descricao}`).join('\n\n');
    return `Tipo de vaga: ${AREA_LEGIVEL[area] || area}.
Idioma do currículo adaptado: ${lang === 'en' ? 'inglês' : 'português'}.

Exemplos reais dessas vagas:
${vagas || '(sem exemplos)'}

Currículo original:
${String(textoCv).slice(0, 15000)}`;
}

/** Lê a resposta: o currículo passa pela mesma limpeza da análise; as mudanças, à parte. */
export function lerVersao(conteudo, textoCv = '') {
    const base = lerResposta(conteudo, textoCv);
    if (!base) return null;
    let mudancas = [];
    try {
        const p = JSON.parse(String(conteudo).match(/\{[\s\S]*\}/)[0]);
        if (Array.isArray(p.mudancas)) mudancas = p.mudancas.map((x) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)).filter(Boolean).slice(0, 8);
    } catch { /* sem a lista, a versão continua valendo */ }
    return { curriculo: base.curriculo, mudancas };
}
