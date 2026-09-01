import { useState } from 'react';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';

// =========================
// Vagas em destaque do dia + post pronto para o LinkedIn
// =========================
// A base de vagas é conteúdo, não só produto: uma lista de vagas remotas de
// verdade vale por si. Aqui ela aparece para o usuário e, junto, o texto pronto
// para ele publicar — quem divulga a plataforma são as pessoas que a usam, e
// pedir isso sem entregar o texto pronto é pedir trabalho a quem já está
// procurando emprego.
//
// A lista muda uma vez por dia (não a cada recarga): quem copiou de manhã e
// voltou à tarde precisa ver a mesma coisa, senão acha que copiou errado.

const AREA_LABEL = {
    dev: 'Desenvolvimento', qa: 'QA', data: 'Dados', devops: 'DevOps',
    mobile: 'Mobile', design: 'Design', po: 'Produto', suporte: 'Suporte',
};

export default function HighlightsSection() {
    const { t } = useT();
    const { data, loading } = useCachedResource('highlights', () => api.getHighlights());
    const [copiado, setCopiado] = useState(false);
    const [aberto, setAberto] = useState(false);

    const vagas = data?.vagas || [];

    async function copiar() {
        try {
            await navigator.clipboard.writeText(data.post);
        } catch {
            // clipboard bloqueado (http, permissão negada, navegador antigo):
            // seleciona o texto para o usuário copiar à mão em vez de não fazer nada.
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
                <button className="btn sm ghost" onClick={() => setAberto((v) => !v)}>
                    <i className={`ti ti-brand-linkedin`} /> {aberto ? t('ocultar post') : t('post pronto p/ LinkedIn')}
                </button>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 14 }}>
                {t('Selecionadas hoje entre as {n} vagas remotas do Brasil na base. A lista muda todo dia.',
                    { n: (data.totalRemotas || 0).toLocaleString('pt-BR') })}
            </p>

            {vagas.map((v) => (
                <div key={v.id} className="rank-row">
                    <div className="job-logo" style={{ width: 32, height: 32, fontSize: 15 }}><i className="ti ti-briefcase" /></div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.title}</div>
                        <div className="muted" style={{ fontSize: 12 }}>
                            {v.company ? `${v.company} · ` : ''}{AREA_LABEL[v.area] || v.area} · {t('remoto')}
                        </div>
                    </div>
                </div>
            ))}

            {aberto && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                    <div className="row" style={{ alignItems: 'center', marginBottom: 8 }}>
                        <span className="muted" style={{ fontSize: 12 }}>
                            {t('Copie e publique. Ajuda quem está procurando vaga e traz gente para a plataforma.')}
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
