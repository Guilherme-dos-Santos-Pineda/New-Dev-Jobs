import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { scoreClass } from '../utils.js';
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
export default function VagasLink() {
    const { t } = useT();
    const { data, loading } = useCachedResource('vagas-link', api.vagasPorLink);
    const [aberta, setAberta] = useState(null);
    const [abertas, setAbertas] = useState(lerAbertas);

    function marcar(id) {
        const novas = new Set(abertas).add(id);
        setAbertas(novas);
        try { localStorage.setItem(CHAVE, JSON.stringify([...novas].slice(-GUARDA_NO_MAXIMO))); } catch { /* sem armazenamento, vale até fechar a tela */ }
    }
    const vagas = data?.vagas || [];

    return (
        <div className="page">
            <div className="page-head">
                <div>
                    <h1>{t('Vagas por link')}</h1>
                    <p className="muted">{t('Estas vagas não têm email. Você se candidata pelo link do post, e elas não gastam seus envios do dia.')}</p>
                </div>
            </div>

            {loading && !data ? (
                <div className="card" style={{ padding: 18 }}>
                    <div className="skeleton sk-line" /><div className="skeleton sk-line" style={{ width: '70%' }} />
                </div>
            ) : vagas.length === 0 ? (
                <div className="card empty" style={{ padding: 34 }}>
                    <i className="ti ti-mood-search" />
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('Nenhuma vaga por link combina com você agora.')}</div>
                    <Link to="/app/perfil" className="btn sm" style={{ marginTop: 10 }}>{t('Ajustar o que eu procuro')}</Link>
                </div>
            ) : (
                <div className="card lista-card vh-lista">
                    {vagas.map((v) => (
                        <div key={v.id} className={`vh-vaga ${abertas.has(v.id) ? 'feita' : ''}`}>
                            <div className="vh-linha">
                                <button className="vh-info" onClick={() => setAberta(aberta === v.id ? null : v.id)} aria-expanded={aberta === v.id}>
                                    <span className="vh-titulo">{v.title}</span>
                                    <span className="vh-sub">
                                        {haQuanto(v.createdAt)}{' · '}
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
