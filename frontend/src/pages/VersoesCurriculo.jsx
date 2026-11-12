import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';
import { FolhaDoCurriculo, CabecalhoIA } from './Curriculo.jsx';

// Um currículo por tipo de vaga (11/11/2026): a pessoa vê as vagas de um tipo AO
// LADO do currículo que a IA adaptou para elas, lê o que mudou e aprova. Com o
// plano com IA, todo envio para vaga daquele tipo leva a versão aprovada
// (backend/services/cvVersoes.js, versaoParaEnvio). Sem versão aprovada, vai o PDF do perfil.

export default function VersoesCurriculo() {
    const { t } = useT();
    const [dados, setDados] = useState(null);
    const [aberto, setAberto] = useState(null); // chave "area:lang"
    const [ocupado, setOcupado] = useState('');
    const [erro, setErro] = useState('');
    const trava = useRef(false);

    useEffect(() => { api.versoesCv().then(setDados).catch(() => setDados({ disponivel: false })); }, []);

    const chave = (g) => `${g.area}:${g.lang}`;
    function trocarVersao(g, versao) {
        setDados((d) => ({ ...d, grupos: d.grupos.map((x) => (chave(x) === chave(g) ? { ...x, versao } : x)) }));
    }

    async function acao(nome, fn) {
        if (trava.current) return;
        trava.current = true;
        setOcupado(nome);
        setErro('');
        try { await fn(); } catch (e) { setErro(e.message); }
        finally { setOcupado(''); trava.current = false; }
    }

    const gerar = (g) => acao(`gerar:${chave(g)}`, async () => { trocarVersao(g, await api.gerarVersaoCv(g.area, g.lang)); setAberto(chave(g)); });
    const aprovar = (g) => acao(`aprovar:${chave(g)}`, async () => trocarVersao(g, await api.aprovarVersaoCv(g.versao.id)));
    const apagar = (g) => acao(`apagar:${chave(g)}`, async () => { await api.apagarVersaoCv(g.versao.id); trocarVersao(g, null); });

    if (!dados) return <div className="page"><div className="muted">{t('Carregando…')}</div></div>;
    if (!dados.disponivel) {
        return (
            <div className="page">
                <CabecalhoIA versoes={false} />
                <div className="card"><p className="muted">{dados.faltaMigration ? 'Falta aplicar a migration 0026 (tabela CvVersoes).' : t('Esta ferramenta ainda não está disponível. Volte em breve.')}</p></div>
            </div>
        );
    }

    return (
        <div className="page cv-pagina">
            <CabecalhoIA versoes />
            <ol className="ia-passos">
                <li><b>{t('Crie')}</b> {t('a versão de um tipo de vaga do seu feed. A IA adapta o seu currículo para ele, sem inventar nada.')}</li>
                <li><b>{t('Confira')}</b> {t('ao lado de vagas reais desse tipo e veja o que a IA mudou.')}</li>
                <li><b>{t('Aprove.')}</b> {t('A partir daí, as vagas desse tipo recebem esta versão. As outras continuam recebendo o currículo do seu perfil.')}</li>
            </ol>
            {dados.nosEnvios
                ? <div className="why ok" style={{ marginBottom: 14 }}><i className="ti ti-circle-check" />{t('Ligado: seus envios usam a versão aprovada do tipo de cada vaga.')}</div>
                : <div className="why" style={{ marginBottom: 14 }}><i className="ti ti-info-circle" />{t('Você está vendo como administrador. As versões só vão nos envios de quem tem o plano Automático + IA.')}</div>}
            {erro && <div className="card cv-erro" style={{ marginBottom: 14 }}>{erro}</div>}

            <div className="card cv-versoes">
                {dados.grupos.length === 0 && <div className="muted">{t('Ainda não há vagas no seu feed para montar versões.')}</div>}
                {dados.grupos.map((g) => {
                    const k = chave(g);
                    const v = g.versao;
                    const estaAberto = aberto === k;
                    return (
                        <div key={k} className="cv-versao">
                            <div className="cv-versao-linha">
                                <div className="cv-versao-nome">
                                    <strong>{g.areaNome}</strong>
                                    {g.lang === 'en' && <span className="badge info">{t('em inglês')}</span>}
                                    <span className="muted">{t('{n} vagas no seu feed', { n: g.vagas })}</span>
                                </div>
                                <div className="row" style={{ gap: 6 }}>
                                    {v ? (
                                        <>
                                            <span className={`badge ${v.status === 'aprovada' ? 'ok' : 'warn'}`}>{v.status === 'aprovada' ? t('Aprovada') : t('Esperando sua revisão')}</span>
                                            <button className="btn sm" onClick={() => setAberto(estaAberto ? null : k)}>{estaAberto ? t('Fechar') : t('Ver')}</button>
                                        </>
                                    ) : (
                                        <button className="btn primary sm" disabled={!!ocupado} onClick={() => gerar(g)}>
                                            {ocupado === `gerar:${k}` ? t('Adaptando… até 1 minuto') : t('Criar versão')}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {estaAberto && v && (
                                <div className="cv-comparar">
                                    <div className="cv-comparar-vagas">
                                        <h3>{t('Vagas desse tipo no seu feed')}</h3>
                                        {g.exemplos.map((e) => (
                                            <div key={e.id} className="cv-vaga-exemplo">
                                                <strong>{e.titulo}</strong>{e.empresa ? <span className="muted"> · {e.empresa}</span> : null}
                                                {e.skills.length > 0 && (
                                                    <div className="cv-palavras">{e.skills.map((s) => <span key={s} className="chip muted">{s}</span>)}</div>
                                                )}
                                            </div>
                                        ))}
                                        {v.mudancas.length > 0 && (
                                            <>
                                                <h3>{t('O que a IA mudou')}</h3>
                                                <ul>{v.mudancas.map((m, i) => <li key={i}>{m}</li>)}</ul>
                                            </>
                                        )}
                                    </div>
                                    <div className="cv-comparar-folha">
                                        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                                            {v.status !== 'aprovada' && (
                                                <button className="btn primary sm" disabled={!!ocupado} onClick={() => aprovar(g)}>
                                                    <i className="ti ti-check" /> {ocupado === `aprovar:${k}` ? t('Salvando…') : t('Aprovar esta versão')}
                                                </button>
                                            )}
                                            <button className="btn sm" disabled={!!ocupado} onClick={() => gerar(g)}>
                                                {ocupado === `gerar:${k}` ? t('Adaptando… até 1 minuto') : t('Refazer')}
                                            </button>
                                            <button className="btn ghost sm" disabled={!!ocupado} onClick={() => apagar(g)}>{t('Excluir')}</button>
                                        </div>
                                        <FolhaDoCurriculo cv={v.curriculo} />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
