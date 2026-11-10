import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// Melhorar meu currículo: análise e reescrita pela IA (backend/services/analiseCv.js).
// Em teste: 3 análises por pessoa. A tela diz desde o primeiro dia que depois do
// teste a ferramenta faz parte do plano pago, para ninguém sentir que perdeu algo.

// "[quantos usuários?]" é o lembrete que a IA deixa onde só a pessoa sabe o dado.
function ComLembretes({ texto }) {
    const partes = String(texto || '').split(/(\[[^\]]{1,80}\])/g);
    return partes.map((p, i) => (/^\[[^\]]+\]$/.test(p) ? <mark key={i} className="cv-lembrete">{p}</mark> : p));
}

function textoDoCurriculo(cv) {
    const linhas = [cv.nome, cv.titulo, cv.contato, '', cv.resumoProfissional, ''];
    if (cv.habilidades?.length) linhas.push('HABILIDADES', ...cv.habilidades.map((h) => `${h.categoria}: ${h.itens}`), '');
    if (cv.experiencias?.length) {
        linhas.push('EXPERIÊNCIA');
        for (const e of cv.experiencias) {
            linhas.push([e.cargo, e.empresa, e.periodo].filter(Boolean).join(' | '), ...e.atividades.map((a) => `- ${a}`));
            if (e.tecnologias) linhas.push(`Tecnologias: ${e.tecnologias}`);
            linhas.push('');
        }
    }
    if (cv.projetos?.length) {
        linhas.push('PROJETOS');
        for (const p of cv.projetos) linhas.push(p.nome, ...p.descricao.map((d) => `- ${d}`), p.stack ? `Stack: ${p.stack}` : '', '');
    }
    if (cv.formacao?.length) linhas.push('FORMAÇÃO', ...cv.formacao.map((f) => [f.curso, f.instituicao, f.periodo].filter(Boolean).join(' | ')), '');
    if (cv.certificacoes?.length) linhas.push('CERTIFICAÇÕES', ...cv.certificacoes, '');
    if (cv.idiomas?.length) linhas.push('IDIOMAS', ...cv.idiomas.map((i) => [i.idioma, i.nivel].filter(Boolean).join(': ')));
    return linhas.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
}

function FolhaDoCurriculo({ cv }) {
    const { t } = useT();
    return (
        <div className="cv-folha">
            <div className="cv-cabeca">
                <div className="cv-nome">{cv.nome}</div>
                {cv.titulo && <div className="cv-titulo">{cv.titulo}</div>}
                {cv.contato && <div className="cv-contato">{cv.contato}</div>}
            </div>
            {cv.resumoProfissional && (
                <section><h3>{t('Resumo profissional')}</h3><p><ComLembretes texto={cv.resumoProfissional} /></p></section>
            )}
            {cv.habilidades?.length > 0 && (
                <section>
                    <h3>{t('Habilidades')}</h3>
                    {cv.habilidades.map((h, i) => <p key={i}><strong>{h.categoria}:</strong> {h.itens}</p>)}
                </section>
            )}
            {cv.experiencias?.length > 0 && (
                <section>
                    <h3>{t('Experiência')}</h3>
                    {cv.experiencias.map((e, i) => (
                        <div key={i} className="cv-item">
                            <div className="cv-item-topo"><strong>{e.cargo}</strong>{e.empresa ? ` · ${e.empresa}` : ''}<span>{e.periodo}</span></div>
                            <ul>{e.atividades.map((a, j) => <li key={j}><ComLembretes texto={a} /></li>)}</ul>
                            {e.tecnologias && <p className="cv-tec">{t('Tecnologias')}: {e.tecnologias}</p>}
                        </div>
                    ))}
                </section>
            )}
            {cv.projetos?.length > 0 && (
                <section>
                    <h3>{t('Projetos')}</h3>
                    {cv.projetos.map((p, i) => (
                        <div key={i} className="cv-item">
                            <div className="cv-item-topo"><strong>{p.nome}</strong></div>
                            <ul>{p.descricao.map((d, j) => <li key={j}><ComLembretes texto={d} /></li>)}</ul>
                            {p.stack && <p className="cv-tec">Stack: {p.stack}</p>}
                        </div>
                    ))}
                </section>
            )}
            {cv.formacao?.length > 0 && (
                <section>
                    <h3>{t('Formação')}</h3>
                    {cv.formacao.map((f, i) => (
                        <div key={i} className="cv-item-topo"><strong>{f.curso}</strong>{f.instituicao ? ` · ${f.instituicao}` : ''}<span>{f.periodo}</span></div>
                    ))}
                </section>
            )}
            {cv.certificacoes?.length > 0 && (
                <section><h3>{t('Certificações')}</h3><ul>{cv.certificacoes.map((c, i) => <li key={i}>{c}</li>)}</ul></section>
            )}
            {cv.idiomas?.length > 0 && (
                <section><h3>{t('Idiomas')}</h3><p>{cv.idiomas.map((x) => [x.idioma, x.nivel].filter(Boolean).join(': ')).join(' · ')}</p></section>
            )}
        </div>
    );
}

export default function Curriculo() {
    const { t } = useT();
    const [estado, setEstado] = useState(null);
    const [temCv, setTemCv] = useState(null);
    const [analisando, setAnalisando] = useState(false);
    const [erro, setErro] = useState('');
    const [copiado, setCopiado] = useState(false);
    const trava = useRef(false);

    useEffect(() => {
        api.analiseCv().then(setEstado).catch(() => setEstado({ disponivel: false }));
        // GET /profile devolve { profile: {...} }: ler direto em p dava "sem currículo" para todo mundo.
        api.getProfile().then((r) => {
            const p = r?.profile;
            setTemCv(p ? Boolean(p.cvName || p.hasCv) : null);
        }).catch(() => setTemCv(null));
    }, []);

    async function analisar() {
        if (trava.current) return;
        trava.current = true;
        setAnalisando(true);
        setErro('');
        try {
            const r = await api.analisarCv();
            setEstado((e) => ({
                ...e, ultima: r, usadas: (e?.usadas || 0) + 1,
                restantes: e?.restantes == null ? null : Math.max(0, e.restantes - 1),
            }));
        } catch (e) {
            setErro(e.message);
        } finally {
            setAnalisando(false);
            trava.current = false;
        }
    }

    function baixarPdf() {
        document.body.classList.add('imprimindo-cv');
        const tirar = () => { document.body.classList.remove('imprimindo-cv'); window.removeEventListener('afterprint', tirar); };
        window.addEventListener('afterprint', tirar);
        window.print();
    }

    async function copiar(cv) {
        try {
            await navigator.clipboard.writeText(textoDoCurriculo(cv));
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        } catch { /* sem permissão de área de transferência: o botão só não confirma */ }
    }

    if (!estado) return <div className="page"><div className="muted">{t('Carregando…')}</div></div>;

    if (!estado.disponivel) {
        return (
            <div className="page">
                <div className="page-head"><div><h1>{t('Melhorar meu currículo')}</h1></div></div>
                <div className="card"><p className="muted">{t('Esta ferramenta ainda não está disponível. Volte em breve.')}</p></div>
            </div>
        );
    }

    const r = estado.ultima;
    const semLimite = estado.restantes == null;
    const acabou = !semLimite && estado.restantes <= 0;

    return (
        <div className="page cv-pagina">
            <div className="page-head">
                <div>
                    <h1>{t('Melhorar meu currículo')}</h1>
                    <p className="muted">{t('A IA lê o currículo que você anexou, mostra o que está bom e o que falta para as vagas que você recebe, e reescreve tudo para os sistemas de triagem.')}</p>
                </div>
            </div>

            <div className="card cv-acao">
                <div className="cv-acao-txt">
                    <span className="badge info">{t('Em teste')}</span>{' '}
                    {semLimite
                        ? t('Sem limite para administradores.')
                        : t('Você tem {n} de {limite} análises grátis. Depois do teste, a ferramenta faz parte do plano Automático.', { n: estado.restantes, limite: estado.limite })}
                </div>
                {temCv === false ? (
                    <Link className="btn primary" to="/app/perfil">{t('Anexar meu currículo primeiro')}</Link>
                ) : (
                    <button className="btn primary" disabled={analisando || acabou} onClick={analisar}>
                        {analisando ? t('Lendo seu currículo… leva até 1 minuto') : r ? t('Analisar de novo') : t('Analisar meu currículo')}
                    </button>
                )}
                {erro && <div className="cv-erro">{erro}</div>}
                {acabou && <div className="muted cv-erro">{t('Você já usou as análises do teste. A última continua aqui embaixo.')}</div>}
            </div>

            {r && (
                <>
                    <div className="card cv-nota">
                        {r.score != null && <div className="cv-score"><b>{r.score}</b><span>{t('de 100')}</span></div>}
                        <div>
                            <h2>{t('Como seu currículo está hoje')}</h2>
                            {r.resumoExecutivo && <p>{r.resumoExecutivo}</p>}
                            {r.comparacaoMercado && <p className="muted">{r.comparacaoMercado}</p>}
                        </div>
                    </div>

                    <div className="cv-duas">
                        <div className="card">
                            <h2><i className="ti ti-thumb-up" /> {t('Pontos fortes')}</h2>
                            <ul>{r.pontosFortes.map((p, i) => <li key={i}>{p}</li>)}</ul>
                        </div>
                        <div className="card">
                            <h2><i className="ti ti-alert-triangle" /> {t('O que melhorar')}</h2>
                            <ul>{r.pontosFracos.map((p, i) => <li key={i}>{p}</li>)}</ul>
                        </div>
                    </div>

                    {r.dicas.length > 0 && (
                        <div className="card">
                            <h2><i className="ti ti-bulb" /> {t('Dicas para o seu currículo')}</h2>
                            <ol>{r.dicas.map((d, i) => <li key={i}>{d}</li>)}</ol>
                        </div>
                    )}

                    {r.palavrasChave.length > 0 && (
                        <div className="card">
                            <h2><i className="ti ti-key" /> {t('Palavras-chave das suas vagas')}</h2>
                            <p className="muted">{t('Os sistemas de triagem procuram estas palavras. As verdes já estão no seu currículo; as cinzas só entram se você de fato tiver a experiência.')}</p>
                            <div className="cv-palavras">
                                {r.palavrasChave.map((p) => (
                                    <span key={p.palavra} className={`chip ${p.temNoCurriculo ? 'cv-tem' : 'muted'}`}>
                                        {p.temNoCurriculo && <i className="ti ti-check" />} {p.palavra}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="card">
                        <div className="cv-reescrito-topo">
                            <h2><i className="ti ti-file-text" /> {t('Seu currículo reescrito')}</h2>
                            <div className="row">
                                <button className="btn sm" onClick={() => copiar(r.curriculo)}>{copiado ? t('Copiado') : t('Copiar texto')}</button>
                                <button className="btn primary sm" onClick={baixarPdf}><i className="ti ti-download" /> {t('Baixar PDF')}</button>
                            </div>
                        </div>
                        <div className="why"><i className="ti ti-info-circle" />{t('Revise antes de usar. O que aparece marcado entre colchetes é um dado que só você sabe: preencha ou apague. Depois de baixar o PDF, anexe em Meu perfil para ele ir nos seus envios.')}</div>
                        <FolhaDoCurriculo cv={r.curriculo} />
                    </div>
                </>
            )}
        </div>
    );
}
