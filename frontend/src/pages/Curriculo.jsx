import { useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';
import { AvisoIA } from '../components/PlanoIA.jsx';

// Currículo com IA: uma seção própria no menu (11/11/2026, o dono achou confuso
// a análise e as versões misturadas). Duas abas, cada uma dizendo em uma frase o
// que faz: "Analisar meu currículo" (backend/services/analiseCv.js, grátis, 2 por
// pessoa) e "Um currículo por tipo de vaga" (VersoesCurriculo.jsx, plano com IA).

/** Topo comum às duas abas. A aba de versões só aparece para quem tem acesso. */
export function CabecalhoIA({ versoes, ia }) {
    const { t } = useT();
    return (
        <>
            <div className="page-head">
                <div>
                    <h1><i className="ti ti-sparkles" /> {t('Currículo com IA')}</h1>
                    <p className="muted">{t('A IA trabalha no seu currículo. Nada muda nos seus envios sem você aprovar.')}</p>
                </div>
            </div>
            <AvisoIA ia={ia} />
            {versoes && (
                <div className="ia-abas" role="tablist">
                    <NavLink to="/app/curriculo" end role="tab" className={({ isActive }) => `ia-aba ${isActive ? 'on' : ''}`}>
                        <i className="ti ti-report-search" />
                        <span><b>{t('Analisar meu currículo')}</b><small>{t('Nota, pontos fortes e o que melhorar')}</small></span>
                    </NavLink>
                    <NavLink to="/app/curriculo/versoes" role="tab" className={({ isActive }) => `ia-aba ${isActive ? 'on' : ''}`}>
                        <i className="ti ti-files" />
                        <span><b>{t('Um currículo por tipo de vaga')}</b><small>{t('A IA adapta, você aprova, os envios usam')}</small></span>
                    </NavLink>
                </div>
            )}
        </>
    );
}

const temLembrete = (cv) => /\[[^\]]{1,80}\]/.test(JSON.stringify(cv || {}));

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

export function FolhaDoCurriculo({ cv }) {
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
    // Histórico (pedido de usuário): abrir uma análise antiga sem gastar uso.
    const [aberta, setAberta] = useState(null);
    const [abrindo, setAbrindo] = useState(false);
    // A reescrita fica recolhida: a análise agradou quase todo mundo, a reescrita
    // nem tanto, e ela é um extra, não o resultado principal.
    const [verReescrita, setVerReescrita] = useState(false);
    const trava = useRef(false);

    // A aba das versões só aparece para quem a API libera (plano com IA ou admin).
    const [versoes, setVersoes] = useState(false);
    useEffect(() => { api.versoesCv().then((v) => setVersoes(!!v?.disponivel)).catch(() => {}); }, []);

    // Volta do checkout do plano de IA: confere o pagamento direto na Stripe (o
    // webhook é a outra via) e recarrega o estado.
    const [aviso, setAviso] = useState('');
    useEffect(() => {
        const q = new URLSearchParams(window.location.search);
        const sessao = q.get('session_id');
        if (q.get('checkout') === 'success' && sessao) {
            window.history.replaceState(null, '', window.location.pathname);
            api.confirmarPagamento(sessao)
                .then((r) => { setAviso(r?.concedido ? t('Pronto: a IA está liberada por 30 dias.') : t('Pagamento em processamento. Assim que confirmar, a IA é liberada.')); return api.analiseCv(); })
                .then((e) => e && setEstado(e))
                .catch(() => setAviso(t('Pagamento em processamento. Assim que confirmar, a IA é liberada.')));
        }
    }, []);

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
            setAberta(null);
            setEstado((e) => ({
                ...e, ultima: r, usadas: (e?.usadas || 0) + 1,
                restantes: e?.restantes == null ? null : Math.max(0, e.restantes - 1),
                historico: [{ id: r.id, criadaEm: r.criadaEm, score: r.score }, ...(e?.historico || [])],
            }));
        } catch (e) {
            setErro(e.message);
        } finally {
            setAnalisando(false);
            trava.current = false;
        }
    }

    async function abrir(id) {
        if (abrindo) return;
        if (id === estado?.ultima?.id) { setAberta(null); return; }
        setAbrindo(true);
        try { setAberta(await api.analiseCvAntiga(id)); }
        catch (e) { setErro(e.message); }
        finally { setAbrindo(false); }
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
                <CabecalhoIA versoes={versoes} />
                <div className="card"><p className="muted">{t('Esta ferramenta ainda não está disponível. Volte em breve.')}</p></div>
            </div>
        );
    }

    const r = aberta || estado.ultima;
    const historico = estado.historico || [];
    const semLimite = estado.restantes == null;
    const acabou = estado.ia ? !estado.ia.podeAnalisar : (!semLimite && estado.restantes <= 0);

    return (
        <div className="page cv-pagina">
            <CabecalhoIA versoes={versoes} ia={estado.ia} />
            {aviso && <div className="why ok" style={{ marginBottom: 14 }}><i className="ti ti-circle-check" />{aviso}</div>}
            <p className="muted ia-explica">{t('A IA lê o currículo que você anexou em Meu perfil e mostra o que está bom e o que falta para as vagas que você recebe. Seu currículo não muda.')}</p>

            <div className="card cv-acao">
                <div className="cv-acao-txt">
                    {semLimite ? t('Sem limite para administradores.') : t('A análise lê o currículo do seu perfil e leva até 1 minuto.')}
                </div>
                {temCv === false ? (
                    <Link className="btn primary" to="/app/perfil">{t('Anexar meu currículo primeiro')}</Link>
                ) : (
                    <button className="btn primary" disabled={analisando || acabou} onClick={analisar}>
                        {analisando ? t('Lendo seu currículo… leva até 1 minuto') : r ? t('Analisar de novo') : t('Analisar meu currículo')}
                    </button>
                )}
                {erro && <div className="cv-erro">{erro}</div>}
                {acabou && historico.length > 0 && <div className="muted cv-erro">{t('Suas análises continuam salvas aqui embaixo.')}</div>}
            </div>

            {historico.length > 1 && (
                <div className="card cv-historico">
                    <h2><i className="ti ti-history" /> {t('Suas análises')}</h2>
                    <div className="cv-palavras">
                        {historico.map((h, i) => (
                            <button key={h.id} type="button" disabled={abrindo}
                                className={`chip toggle ${r?.id === h.id ? 'on' : ''}`} onClick={() => abrir(h.id)}>
                                {new Date(h.criadaEm).toLocaleDateString()}{h.score != null ? ` · ${h.score}` : ''}{i === 0 ? ` · ${t('mais recente')}` : ''}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {r && (
                <>
                    {aberta && aberta.id !== estado.ultima?.id && (
                        <div className="why"><i className="ti ti-history" />{t('Você está vendo uma análise antiga, de {data}.', { data: new Date(aberta.criadaEm).toLocaleDateString() })}</div>
                    )}
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
                            <h2><i className="ti ti-file-text" /> {t('Sugestão de currículo reescrito')} <span className="badge info">{t('opcional')}</span></h2>
                            <div className="row">
                                {verReescrita && <button className="btn sm" onClick={() => copiar(r.curriculo)}>{copiado ? t('Copiado') : t('Copiar texto')}</button>}
                                {verReescrita && <button className="btn primary sm" onClick={baixarPdf}><i className="ti ti-download" /> {t('Baixar PDF')}</button>}
                                {!verReescrita && <button className="btn sm" onClick={() => setVerReescrita(true)}>{t('Ver a sugestão')}</button>}
                            </div>
                        </div>
                        {verReescrita ? (
                            <>
                                {temLembrete(r.curriculo) && <div className="why"><i className="ti ti-info-circle" />{t('Os trechos entre colchetes são dados que só você sabe: preencha ou apague antes de usar.')}</div>}
                                <FolhaDoCurriculo cv={r.curriculo} />
                            </>
                        ) : (
                            <p className="muted" style={{ fontSize: 13 }}>{t('Uma versão do seu currículo já com as dicas aplicadas. Use só o que fizer sentido para você: o seu currículo continua sendo o que você anexou.')}</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
