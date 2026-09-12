import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useToast } from './Toast.jsx';
import { useT } from '../lib/i18n.jsx';

// =========================
// Vagas remotas em destaque do dia
// =========================
// A base de vagas é conteúdo, não só produto: uma lista de vagas remotas de
// verdade vale por si. Daqui a pessoa vê os detalhes e se candidata direto, sem
// passar pelo fluxo de busca.
//
// O envio sai da MESMA cota grátis diária do envio automático (7/dia no free) — a
// tela diz isso antes e depois de enviar, porque gastar a cota do dia sem saber é
// o tipo de surpresa que faz a pessoa desconfiar do resto.
//
// A lista muda uma vez por dia (não a cada recarga): quem olhou de manhã e
// voltou à tarde precisa ver a mesma coisa.
//
// O post pronto para o LinkedIn NÃO mora aqui: é material de divulgação, vive na
// tela do admin (`AdminPromoPost`). Esta seção é do usuário.

const AREA_LABEL = {
    dev: 'Desenvolvimento', qa: 'QA', data: 'Dados', devops: 'DevOps',
    mobile: 'Mobile', design: 'Design', po: 'Produto', suporte: 'Suporte',
};
const NIVEL_LABEL = {
    estagio: 'Estágio', junior: 'Júnior', pleno: 'Pleno',
    senior: 'Sênior', lead: 'Tech Lead', manager: 'Gerência',
};

export default function HighlightsSection({ onQueued }) {
    const { t } = useT();
    const toast = useToast();
    const { data, loading, refresh } = useCachedResource('highlights', () => api.getHighlights());
    const [marcadas, setMarcadas] = useState(() => new Set());
    const [aberta, setAberta] = useState(null);
    const [enviando, setEnviando] = useState(false);
    const enviandoRef = useRef(false); // trava síncrona contra duplo-clique

    const vagas = data?.vagas || [];
    const maximo = data?.maxCandidaturas ?? 0;
    const limiteDiario = data?.limiteDiario ?? 7;
    const disponiveis = vagas.filter((v) => !v.applied);
    const semCota = maximo === 0;

    function alternar(id) {
        setMarcadas((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            else if (n.size < maximo) n.add(id);
            // O teto é do servidor; aqui só evitamos deixar marcar mais do que
            // cabe para a pessoa não descobrir a regra errando.
            else toast.show(t('Você pode enviar para até {n} vagas hoje.', { n: maximo }), 'error');
            return n;
        });
    }

    async function candidatar() {
        if (enviandoRef.current || !marcadas.size) return;
        enviandoRef.current = true;
        setEnviando(true);
        try {
            const r = await api.applyHighlights([...marcadas]);
            toast.show(t('{n} vaga(s) na fila. Restam {r} envios grátis hoje.', { n: r.queued, r: r.restanteHoje }));
            setMarcadas(new Set());
            refresh();
            onQueued?.();
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            enviandoRef.current = false;
            setEnviando(false);
        }
    }

    if (loading && !data) return null;
    if (!vagas.length) return null;

    return (
        <div className="card fade-in" style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ marginBottom: 4 }}>
                <i className="ti ti-flame" /> {t('Vagas remotas em destaque')}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>
                {t('Selecionadas hoje entre as {n} vagas remotas do Brasil na base. A lista muda todo dia.',
                    { n: (data.totalRemotas || 0).toLocaleString('pt-BR') })}
            </p>

            {vagas.map((v) => (
                <div key={v.id} className="destaque">
                    <div className="destaque-linha">
                        <input
                            type="checkbox"
                            checked={marcadas.has(v.id)}
                            disabled={v.applied || enviando || semCota}
                            onChange={() => alternar(v.id)}
                            aria-label={t('selecionar vaga')}
                        />
                        <div className="job-logo" style={{ width: 32, height: 32, fontSize: 15 }}><i className="ti ti-briefcase" /></div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <div className="destaque-titulo">{v.title}</div>
                            <div className="muted" style={{ fontSize: 12 }}>
                                {v.company ? `${v.company} · ` : ''}{AREA_LABEL[v.area] || v.area}
                                {v.level ? ` · ${NIVEL_LABEL[v.level]}` : ''} · {t('remoto')}
                            </div>
                        </div>
                        {v.applied && <span className="badge ok">{t('enviado')}</span>}
                        <button type="button" className="btn ghost sm"
                            onClick={() => setAberta(aberta === v.id ? null : v.id)}>
                            <i className={`ti ti-chevron-${aberta === v.id ? 'up' : 'down'}`} />
                            {aberta === v.id ? t('ocultar') : t('detalhes')}
                        </button>
                    </div>

                    {aberta === v.id && (
                        <div className="destaque-detalhe">
                            <div className="chips" style={{ marginBottom: 10 }}>
                                {v.location && <span className="chip muted"><i className="ti ti-map-pin" />{v.location}</span>}
                                {v.salary && <span className="chip muted"><i className="ti ti-cash" />{v.salary}</span>}
                                {(v.skills || []).map((sk) => <span key={sk} className="chip">{sk}</span>)}
                            </div>
                            {v.details
                                ? <p className="destaque-texto">{v.details}</p>
                                : <p className="muted" style={{ fontSize: 12.5 }}>{t('Esta vaga não trouxe descrição.')}</p>}
                            <div className="hint" style={{ marginTop: 10 }}>
                                {/* Dizer POR QUE o contato está oculto evita que pareça defeito. */}
                                <i className="ti ti-lock" /> {t('Email e telefone do recrutador ficam ocultos — quem envia sua candidatura é a plataforma.')}
                            </div>
                        </div>
                    )}
                </div>
            ))}

            <div className="row" style={{ alignItems: 'center', marginTop: 14 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                    {semCota
                        ? t('Você já usou seus {n} envios grátis de hoje. A cota volta amanhã.', { n: limiteDiario })
                        : marcadas.size
                            ? t('{n} de {max} selecionadas — usa seus envios grátis de hoje.', { n: marcadas.size, max: maximo })
                            : t('Marque até {max} vagas. O envio usa sua cota grátis diária ({d}/dia).', { max: maximo, d: limiteDiario })}
                </span>
                <div className="spacer" />
                <button
                    className="btn primary sm"
                    disabled={!marcadas.size || enviando || !disponiveis.length || semCota}
                    onClick={candidatar}
                >
                    <i className={`ti ti-${enviando ? 'loader-2' : 'send'}`} /> {enviando ? t('enviando…') : t('candidatar-se')}
                </button>
            </div>
        </div>
    );
}
