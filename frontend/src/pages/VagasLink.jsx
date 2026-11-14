import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { scoreClass, AREA_OPTIONS } from '../utils.js';
import { haQuanto } from '../lib/tempo.js';

// Vagas cujo post não tem email: a candidatura é pelo link, fora daqui. Não gastam
// envio, e por isso a tela não tem fila nem "Enviar". Ver services/vagasPorLink.js.

// A marca diz "abriu", não "se candidatou": isso acontece fora daqui. Fica no
// navegador, é só para a pessoa não se perder na lista.
const CHAVE = 'vagasLinkAbertas';
const GUARDA_NO_MAXIMO = 500;

function lerAbertas() {
    try {
        const lista = JSON.parse(localStorage.getItem(CHAVE) || '[]');
        return new Set(Array.isArray(lista) ? lista : []);
    } catch { return new Set(); }
}
const NOME_AREA = Object.fromEntries(AREA_OPTIONS.map((a) => [a.value, a.label]));
const MODS = [['', 'Todas'], ['remoto', 'Remoto'], ['hibrido', 'Híbrido'], ['presencial', 'Presencial']];

export default function VagasLink() {
    const { t } = useT();
    // Sem filtro, a lista vem do cache (abre na hora); com filtro, pergunta ao servidor.
    const { data: inicial, loading } = useCachedResource('vagas-link', () => api.vagasPorLink());
    const [filtros, setFiltros] = useState({ q: '', mod: '', dias: '', area: '', fonte: '' });
    const [busca, setBusca] = useState('');
    const [filtrado, setFiltrado] = useState(null);
    const [esconderAbertas, setEsconderAbertas] = useState(false);
    const [aberta, setAberta] = useState(null);
    const [abertas, setAbertas] = useState(lerAbertas);
    const pedido = useRef(0);
    const temFiltro = Object.values(filtros).some(Boolean);

    // Texto: espera a pessoa parar de digitar.
    useEffect(() => {
        const id = setTimeout(() => setFiltros((f) => (f.q === busca.trim() ? f : { ...f, q: busca.trim() })), 350);
        return () => clearTimeout(id);
    }, [busca]);
    useEffect(() => {
        if (!temFiltro) { setFiltrado(null); return; }
        const meu = ++pedido.current;
        api.vagasPorLink(filtros).then((r) => { if (meu === pedido.current) setFiltrado(r); }).catch(() => {});
    }, [filtros]);
    const data = temFiltro ? filtrado : inicial;
    const muda = (campo, valor) => setFiltros((f) => ({ ...f, [campo]: valor }));
    function limpar() { setBusca(''); setFiltros({ q: '', mod: '', dias: '', area: '', fonte: '' }); setEsconderAbertas(false); }

    function marcar(id) {
        const novas = new Set(abertas).add(id);
        setAbertas(novas);
        try { localStorage.setItem(CHAVE, JSON.stringify([...novas].slice(-GUARDA_NO_MAXIMO))); } catch { /* sem armazenamento, vale até fechar a tela */ }
    }
    const vagas = (data?.vagas || []).filter((v) => !esconderAbertas || !abertas.has(v.id));
    const areas = (inicial?.areas || []);

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1>{t('Vagas por link')}</h1>
                    <p className="muted">{t('Estas vagas não têm email. Você se candidata pelo link do anúncio, e elas não gastam seus envios do dia.')}</p>
                </div>
            </div>

            {inicial && (inicial.semFiltro || 0) > 0 && (
                <div className="card vl-filtros">
                    <div className="vl-busca">
                        <i className="ti ti-search" />
                        <input className="input" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder={t('Buscar por cargo, empresa ou tecnologia')} aria-label={t('Buscar')} />
                    </div>
                    <div className="vl-linha">
                        <div className="chips" role="group" aria-label={t('Modalidade')}>
                            {MODS.map(([v, l]) => (
                                <button key={v || 'todas'} type="button" className={`chip toggle ${filtros.mod === v ? 'on' : ''}`} onClick={() => muda('mod', v)}>{t(l)}</button>
                            ))}
                        </div>
                        <select className="select" value={filtros.dias} onChange={(e) => muda('dias', e.target.value)} aria-label={t('Período')}>
                            <option value="">{t('Qualquer data')}</option>
                            <option value="1">{t('Últimas 24 horas')}</option>
                            <option value="7">{t('Últimos 7 dias')}</option>
                            <option value="30">{t('Últimos 30 dias')}</option>
                        </select>
                        {areas.length > 1 && (
                            <select className="select" value={filtros.area} onChange={(e) => muda('area', e.target.value)} aria-label={t('Área')}>
                                <option value="">{t('Todas as áreas')}</option>
                                {areas.map((a) => <option key={a.id} value={a.id}>{t(NOME_AREA[a.id] || a.id)} ({a.n})</option>)}
                            </select>
                        )}
                        <select className="select" value={filtros.fonte} onChange={(e) => muda('fonte', e.target.value)} aria-label={t('Origem')}>
                            <option value="">{t('Anúncios e posts')}</option>
                            <option value="anuncio">{t('Só anúncios do LinkedIn')}</option>
                            <option value="post">{t('Só posts de recrutador')}</option>
                        </select>
                        <label className="vl-check"><input type="checkbox" checked={esconderAbertas} onChange={(e) => setEsconderAbertas(e.target.checked)} /> {t('Esconder as que já abri')}</label>
                    </div>
                    <div className="muted vl-total">
                        {temFiltro && data ? t('{n} de {total} vagas', { n: data.total, total: data.semFiltro }) : t('{n} vagas', { n: inicial.semFiltro })}
                        {(temFiltro || esconderAbertas) && <button type="button" className="link-sutil" onClick={limpar}>{t('Limpar filtros')}</button>}
                    </div>
                </div>
            )}

            {(loading && !inicial) || (temFiltro && !filtrado) ? (
                <div className="card" style={{ padding: 18 }}>
                    <div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} />
                </div>
            ) : vagas.length === 0 ? (
                <div className="card empty" style={{ padding: 34 }}>
                    <i className="ti ti-mood-search" />
                    {temFiltro || esconderAbertas ? (
                        <>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('Nenhuma vaga com esses filtros.')}</div>
                            <button className="btn sm" style={{ marginTop: 10 }} onClick={limpar}>{t('Limpar filtros')}</button>
                        </>
                    ) : (
                        <>
                            <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('Nenhuma vaga por link combina com você agora.')}</div>
                            <Link to="/app/perfil" className="btn sm" style={{ marginTop: 10 }}>{t('Ajustar o que eu procuro')}</Link>
                        </>
                    )}
                </div>
            ) : (
                <div className="card lista-card vh-lista">
                    {vagas.map((v) => (
                        <div key={v.id} className={`vh-vaga ${abertas.has(v.id) ? 'feita' : ''}`}>
                            <div className="vh-linha">
                                <button className="vh-info" onClick={() => setAberta(aberta === v.id ? null : v.id)} aria-expanded={aberta === v.id}>
                                    <span className="vh-titulo">{v.title}</span>
                                    <span className="vh-sub">
                                        {v.company ? `${v.company} · ` : ''}{haQuanto(v.createdAt)}{' · '}
                                        <span className={`vh-match ${scoreClass(v.matchScore)}`}>{t('{n}% compatível', { n: v.matchScore })}</span>
                                    </span>
                                </button>
                                <span className="vh-acoes">
                                    {abertas.has(v.id) && <span className="badge ok"><i className="ti ti-check" /> {t('Aberta')}</span>}
                                    <a className="btn sm" href={v.url} target="_blank" rel="noopener noreferrer" onClick={() => marcar(v.id)}>
                                        <i className="ti ti-external-link" /> {t('Abrir vaga')}
                                    </a>
                                </span>
                            </div>
                            {aberta === v.id && v.description && (
                                <div className="vh-detalhe">
                                    <div className="det-descricao">{v.description}</div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
