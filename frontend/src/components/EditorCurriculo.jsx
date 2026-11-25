import { useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../lib/i18n.jsx';

// =========================
// Editar o currículo da IA direto no app (25/11/2026, pedido de pagante)
// =========================
// A folha continua com a cara da folha: cada campo vira uma caixa de texto no
// mesmo lugar, e lista (atividades, certificações) é uma por linha. Serve à
// reescrita da análise (Curriculo.jsx) e às versões por tipo de vaga
// (VersoesCurriculo.jsx). Quem salva é quem chama (`onSalvar(cv)`); o servidor
// corta tamanhos e tira item vazio (formaDoCurriculo em analiseCvLogic.js).

/** Caixa que cresce com o texto, para a folha não virar um formulário de rolagem. */
function Caixa({ valor, onChange, placeholder, className = '', linhas = 1 }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [valor]);
    return (
        <textarea ref={ref} rows={linhas} className={`cv-ed-caixa ${className}`} value={valor ?? ''}
            placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    );
}

const linhas = (lista) => (lista || []).join('\n');
const deLinhas = (texto) => String(texto || '').split('\n');

function Remover({ onClick }) {
    const { t } = useT();
    return <button type="button" className="cv-ed-remover" onClick={onClick} title={t('Remover')} aria-label={t('Remover')}><i className="ti ti-trash" /></button>;
}

function Adicionar({ onClick, children }) {
    return <button type="button" className="btn ghost sm cv-ed-add" onClick={onClick}><i className="ti ti-plus" /> {children}</button>;
}

export default function EditorCurriculo({ cv: inicial, onSalvar, onCancelar, aviso }) {
    const { t } = useT();
    const [cv, setCv] = useState(() => JSON.parse(JSON.stringify(inicial || {})));
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const trava = useRef(false);

    const campo = (nome) => (v) => setCv((c) => ({ ...c, [nome]: v }));
    const item = (lista, i, nome) => (v) => setCv((c) => ({ ...c, [lista]: c[lista].map((x, j) => (j === i ? { ...x, [nome]: v } : x)) }));
    const tirar = (lista, i) => () => setCv((c) => ({ ...c, [lista]: c[lista].filter((_, j) => j !== i) }));
    const por = (lista, novo) => () => setCv((c) => ({ ...c, [lista]: [...(c[lista] || []), novo] }));

    async function salvar() {
        if (trava.current) return;
        trava.current = true;
        setSalvando(true);
        setErro('');
        // Lista "uma por linha": linha em branco sai aqui; o servidor confere de novo.
        const limpo = {
            ...cv,
            experiencias: (cv.experiencias || []).map((e) => ({ ...e, atividades: (e.atividades || []).map((a) => a.trim()).filter(Boolean) })),
            projetos: (cv.projetos || []).map((p) => ({ ...p, descricao: (p.descricao || []).map((d) => d.trim()).filter(Boolean) })),
            certificacoes: (cv.certificacoes || []).map((c) => c.trim()).filter(Boolean),
        };
        try { await onSalvar(limpo); }
        catch (e) { setErro(e.message); }
        finally { setSalvando(false); trava.current = false; }
    }

    return (
        <div className="cv-editor">
            <div className="why"><i className="ti ti-pencil" />{aviso || t('Clique em qualquer texto para mudar. Nas listas, um item por linha. Linha em branco some ao salvar.')}</div>
            <div className="cv-folha cv-folha-editando">
                <div className="cv-cabeca">
                    <Caixa className="cv-nome" valor={cv.nome} onChange={campo('nome')} placeholder={t('Seu nome')} />
                    <Caixa className="cv-titulo" valor={cv.titulo} onChange={campo('titulo')} placeholder={t('Cargo ou título (ex.: Desenvolvedor Back-end)')} />
                    <Caixa className="cv-contato" valor={cv.contato} onChange={campo('contato')} placeholder={t('Email, telefone, LinkedIn, cidade')} />
                </div>

                <section>
                    <h3>{t('Resumo profissional')}</h3>
                    <Caixa valor={cv.resumoProfissional} onChange={campo('resumoProfissional')} linhas={3} placeholder={t('Quem você é e o que faz bem, em 3 ou 4 frases.')} />
                </section>

                <section>
                    <h3>{t('Habilidades')}</h3>
                    {(cv.habilidades || []).map((h, i) => (
                        <div key={i} className="cv-ed-linha">
                            <Caixa className="cv-ed-rotulo" valor={h.categoria} onChange={item('habilidades', i, 'categoria')} placeholder={t('Categoria')} />
                            <Caixa valor={h.itens} onChange={item('habilidades', i, 'itens')} placeholder={t('Itens, separados por vírgula')} />
                            <Remover onClick={tirar('habilidades', i)} />
                        </div>
                    ))}
                    <Adicionar onClick={por('habilidades', { categoria: '', itens: '' })}>{t('Habilidade')}</Adicionar>
                </section>

                <section>
                    <h3>{t('Experiência')}</h3>
                    {(cv.experiencias || []).map((e, i) => (
                        <div key={i} className="cv-item cv-ed-bloco">
                            <div className="cv-ed-linha">
                                <Caixa className="cv-ed-forte" valor={e.cargo} onChange={item('experiencias', i, 'cargo')} placeholder={t('Cargo')} />
                                <Caixa valor={e.empresa} onChange={item('experiencias', i, 'empresa')} placeholder={t('Empresa')} />
                                <Caixa className="cv-ed-periodo" valor={e.periodo} onChange={item('experiencias', i, 'periodo')} placeholder={t('Período')} />
                                <Remover onClick={tirar('experiencias', i)} />
                            </div>
                            <Caixa valor={linhas(e.atividades)} onChange={(v) => item('experiencias', i, 'atividades')(deLinhas(v))} linhas={3} placeholder={t('O que você fez, uma atividade por linha')} />
                            <Caixa className="cv-tec" valor={e.tecnologias} onChange={item('experiencias', i, 'tecnologias')} placeholder={t('Tecnologias')} />
                        </div>
                    ))}
                    <Adicionar onClick={por('experiencias', { cargo: '', empresa: '', periodo: '', atividades: [], tecnologias: '' })}>{t('Experiência')}</Adicionar>
                </section>

                <section>
                    <h3>{t('Projetos')}</h3>
                    {(cv.projetos || []).map((p, i) => (
                        <div key={i} className="cv-item cv-ed-bloco">
                            <div className="cv-ed-linha">
                                <Caixa className="cv-ed-forte" valor={p.nome} onChange={item('projetos', i, 'nome')} placeholder={t('Nome do projeto')} />
                                <Remover onClick={tirar('projetos', i)} />
                            </div>
                            <Caixa valor={linhas(p.descricao)} onChange={(v) => item('projetos', i, 'descricao')(deLinhas(v))} linhas={2} placeholder={t('O que o projeto faz, um ponto por linha')} />
                            <Caixa className="cv-tec" valor={p.stack} onChange={item('projetos', i, 'stack')} placeholder="Stack" />
                        </div>
                    ))}
                    <Adicionar onClick={por('projetos', { nome: '', descricao: [], stack: '' })}>{t('Projeto')}</Adicionar>
                </section>

                <section>
                    <h3>{t('Formação')}</h3>
                    {(cv.formacao || []).map((f, i) => (
                        <div key={i} className="cv-ed-linha">
                            <Caixa className="cv-ed-forte" valor={f.curso} onChange={item('formacao', i, 'curso')} placeholder={t('Curso')} />
                            <Caixa valor={f.instituicao} onChange={item('formacao', i, 'instituicao')} placeholder={t('Instituição')} />
                            <Caixa className="cv-ed-periodo" valor={f.periodo} onChange={item('formacao', i, 'periodo')} placeholder={t('Período')} />
                            <Remover onClick={tirar('formacao', i)} />
                        </div>
                    ))}
                    <Adicionar onClick={por('formacao', { curso: '', instituicao: '', periodo: '' })}>{t('Formação')}</Adicionar>
                </section>

                <section>
                    <h3>{t('Certificações')}</h3>
                    <Caixa valor={linhas(cv.certificacoes)} onChange={(v) => setCv((c) => ({ ...c, certificacoes: deLinhas(v) }))} linhas={2} placeholder={t('Uma certificação por linha')} />
                </section>

                <section>
                    <h3>{t('Idiomas')}</h3>
                    {(cv.idiomas || []).map((x, i) => (
                        <div key={i} className="cv-ed-linha">
                            <Caixa className="cv-ed-forte" valor={x.idioma} onChange={item('idiomas', i, 'idioma')} placeholder={t('Idioma')} />
                            <Caixa valor={x.nivel} onChange={item('idiomas', i, 'nivel')} placeholder={t('Nível')} />
                            <Remover onClick={tirar('idiomas', i)} />
                        </div>
                    ))}
                    <Adicionar onClick={por('idiomas', { idioma: '', nivel: '' })}>{t('Idioma')}</Adicionar>
                </section>
            </div>
            {erro && <div className="cv-erro">{erro}</div>}
            <div className="row cv-ed-acoes">
                <button className="btn primary" disabled={salvando} onClick={salvar}><i className="ti ti-device-floppy" /> {salvando ? t('Salvando…') : t('Salvar')}</button>
                <button className="btn ghost" disabled={salvando} onClick={onCancelar}>{t('Cancelar')}</button>
            </div>
        </div>
    );
}
