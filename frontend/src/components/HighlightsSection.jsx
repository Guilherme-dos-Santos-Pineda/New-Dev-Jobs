import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useToast } from './Toast.jsx';
import { useT } from '../lib/i18n.jsx';

// =========================
// Vagas remotas em destaque do dia
// =========================
// A base de vagas é conteúdo, não só produto: uma lista de vagas remotas de
// verdade vale por si. Daqui a pessoa pode se candidatar direto, escolhendo o
// que quer — sem passar pelo fluxo de busca.
//
// A lista muda uma vez por dia (não a cada recarga): quem olhou de manhã e
// voltou à tarde precisa ver a mesma coisa.
//
// O post pronto para o LinkedIn só chega para admin — o backend nem manda o
// campo para os demais. É material de divulgação assinado pela plataforma, e
// quem publica em nome dela é quem responde por ela.

const AREA_LABEL = {
    dev: 'Desenvolvimento', qa: 'QA', data: 'Dados', devops: 'DevOps',
    mobile: 'Mobile', design: 'Design', po: 'Produto', suporte: 'Suporte',
};

export default function HighlightsSection({ onQueued }) {
    const { user } = useAuth();
    const { t } = useT();
    const toast = useToast();
    const { data, loading, refresh } = useCachedResource('highlights', () => api.getHighlights());
    const [copiado, setCopiado] = useState(false);
    const [aberto, setAberto] = useState(false);
    const [marcadas, setMarcadas] = useState(() => new Set());
    const [enviando, setEnviando] = useState(false);
    const enviandoRef = useRef(false); // trava síncrona contra duplo-clique

    const vagas = data?.vagas || [];
    const maximo = data?.maxCandidaturas || 10;
    const disponiveis = vagas.filter((v) => !v.applied);

    function alternar(id) {
        setMarcadas((s) => {
            const n = new Set(s);
            if (n.has(id)) n.delete(id);
            // O teto é do backend; aqui só evitamos deixar a pessoa marcar 15 para
            // depois descobrir que só 10 foram.
            else if (n.size < maximo) n.add(id);
            else toast.show(t('Máximo de {n} vagas por vez.', { n: maximo }), 'error');
            return n;
        });
    }

    async function candidatar() {
        if (enviandoRef.current || !marcadas.size) return;
        enviandoRef.current = true;
        setEnviando(true);
        try {
            const r = await api.applyHighlights([...marcadas]);
            toast.show(t('{n} vaga(s) na fila de envio', { n: r.queued }));
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

    async function copiar() {
        try {
            await navigator.clipboard.writeText(data.post);
        } catch {
            // clipboard bloqueado (permissão negada, navegador antigo): seleciona o
            // texto para copiar à mão em vez de simplesmente não fazer nada.
            const el = document.getElementById('post-destaques');
            if (el) { el.focus(); el.select(); document.execCommand?.('copy'); }
        }
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2500);
    }

    if (loading && !data) return null;
    if (!vagas.length) return null;

    return (
        <div className="card fade-in" style={{ marginBottom: 20 }}>
            <div className="row" style={{ alignItems: 'center', marginBottom: 4 }}>
                <div className="section-title" style={{ margin: 0 }}>
                    <i className="ti ti-flame" /> {t('Vagas remotas em destaque')}
                </div>
                <div className="spacer" />
                {/* O campo `post` só vem do backend para admin. */}
                {data.post && (
                    <button className="btn sm ghost" onClick={() => setAberto((v) => !v)}>
                        <i className="ti ti-brand-linkedin" /> {aberto ? t('ocultar post') : t('post pronto p/ LinkedIn')}
                    </button>
                )}
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>
                {t('Selecionadas hoje entre as {n} vagas remotas do Brasil na base. A lista muda todo dia.',
                    { n: (data.totalRemotas || 0).toLocaleString('pt-BR') })}
            </p>

            {vagas.map((v) => (
                <div key={v.id} className="rank-row">
                    <input
                        type="checkbox"
                        checked={marcadas.has(v.id)}
                        disabled={v.applied || enviando}
                        onChange={() => alternar(v.id)}
                        aria-label={t('selecionar vaga')}
                    />
                    <div className="job-logo" style={{ width: 32, height: 32, fontSize: 15 }}><i className="ti ti-briefcase" /></div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                            {v.company ? `${v.company} · ` : ''}{AREA_LABEL[v.area] || v.area} · {t('remoto')}
                        </div>
                    </div>
                    {v.applied && <span className="badge ok" style={{ marginLeft: 'auto' }}>{t('enviado')}</span>}
                </div>
            ))}

            <div className="row" style={{ alignItems: 'center', marginTop: 14 }}>
                <span className="muted" style={{ fontSize: 12 }}>
                    {marcadas.size
                        ? t('{n} de {max} selecionadas', { n: marcadas.size, max: maximo })
                        : t('Marque até {max} vagas para enviar seu currículo.', { max: maximo })}
                </span>
                <div className="spacer" />
                <button
                    className="btn primary sm"
                    disabled={!marcadas.size || enviando || !disponiveis.length}
                    onClick={candidatar}
                >
                    <i className={`ti ti-${enviando ? 'loader-2' : 'send'}`} /> {enviando ? t('enviando…') : t('candidatar-se')}
                </button>
            </div>

            {data.post && aberto && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                    <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                            {t('Post de divulgação do dia (visível só para admin).')}
                        </span>
                        <div className="spacer" />
                        <button className="btn sm primary" onClick={copiar}>
                            <i className={`ti ti-${copiado ? 'check' : 'copy'}`} /> {copiado ? t('copiado!') : t('copiar')}
                        </button>
                    </div>
                    <textarea
                        id="post-destaques"
                        readOnly
                        value={data.post}
                        rows={14}
                        style={{ width: '100%', fontSize: 12.5, lineHeight: 1.5, fontFamily: 'inherit', resize: 'vertical' }}
                    />
                </div>
            )}
        </div>
    );
}
