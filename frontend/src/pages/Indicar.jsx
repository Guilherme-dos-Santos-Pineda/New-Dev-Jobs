import { useState } from 'react';
import { api } from '../api.js';
import { useCachedResource } from '../lib/useCachedResource.js';
import { useT } from '../lib/i18n.jsx';
import { fmtDate } from '../utils.js';

// =========================
// Indique e ganhe (backend/services/indicacao.js)
// =========================
// O bônus sai no PRIMEIRO envio real do amigo pelo Gmail, não no cadastro: conta
// falsa não custa nada, conectar o Gmail e mandar um currículo custa.

export default function Indicar() {
    const { t } = useT();
    const { data, loading } = useCachedResource('indicacao', () => api.indicacao());
    const [copiado, setCopiado] = useState(false);

    const link = data?.link || '';
    const regra = data?.regra || { envios: 10, dias: 7, teto: 60 };
    const texto = t('Tô usando o New Dev Jobs: ele manda seu currículo direto para o email do recrutador, pelo seu Gmail. 20 por dia, de graça. Entra pelo meu link:');
    const enc = encodeURIComponent;
    const compartilhar = [
        { nome: 'WhatsApp', icon: 'ti-brand-whatsapp', url: `https://wa.me/?text=${enc(`${texto} ${link}`)}` },
        { nome: 'LinkedIn', icon: 'ti-brand-linkedin', url: `https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}` },
        { nome: 'Telegram', icon: 'ti-brand-telegram', url: `https://t.me/share/url?url=${enc(link)}&text=${enc(texto)}` },
    ];

    async function copiar() {
        try {
            await navigator.clipboard.writeText(link);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
        } catch { window.prompt(t('Copie o link:'), link); }
    }

    return (
        <div className="page" style={{ maxWidth: 760 }}>
            <div className="page-head">
                <h1>{t('Indique e ganhe')}</h1>
                <p>{t('Cada amigo que mandar o primeiro currículo pelo seu link dá +{n} envios por dia, por {d} dias, para você e para ele.', { n: regra.envios, d: regra.dias })}</p>
            </div>

            <div className="card" style={{ padding: 20 }}>
                <div className="det-rotulo" style={{ marginBottom: 8 }}>{t('Seu link')}</div>
                {loading || !link ? (
                    <div className="skeleton sk-line" />
                ) : (<>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <code style={{ flex: '1 1 240px', minWidth: 0, overflowWrap: 'anywhere', padding: '10px 12px', borderRadius: 10, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border-light)' }}>{link}</code>
                        <button className="btn primary" onClick={copiar}>
                            <i className={`ti ${copiado ? 'ti-check' : 'ti-copy'}`} /> {copiado ? t('Link copiado') : t('Copiar link')}
                        </button>
                    </div>
                    <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                        {compartilhar.map((c) => (
                            <a key={c.nome} className="btn sm" href={c.url} target="_blank" rel="noopener noreferrer">
                                <i className={`ti ${c.icon}`} /> {c.nome}
                            </a>
                        ))}
                    </div>
                </>)}
            </div>

            {data && (
                <div className="card" style={{ padding: 20, marginTop: 14 }}>
                    <div className="det-campos">
                        <div className="det-campo">
                            <span className="det-rotulo">{t('Criaram conta pelo seu link')}</span>
                            <span className="det-valor">{data.indicados}</span>
                        </div>
                        <div className="det-campo">
                            <span className="det-rotulo">{t('Já mandaram o primeiro currículo')}</span>
                            <span className="det-valor ok">{data.premiados}</span>
                        </div>
                        <div className="det-campo larga">
                            <span className="det-rotulo">{t('Seu bônus')}</span>
                            <span className={`det-valor ${data.bonusAte ? 'ok' : ''}`}>
                                {data.bonusAte
                                    ? t('+{n} envios por dia até {data}', { n: regra.envios, data: fmtDate(data.bonusAte) })
                                    : t('Nenhum bônus ativo agora.')}
                            </span>
                        </div>
                    </div>
                    {data.bonusEsperando && (
                        <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                            {t('Você entrou pelo link de alguém: o seu bônus sai no seu primeiro envio pelo Gmail.')}
                        </p>
                    )}
                </div>
            )}

            <div className="card" style={{ padding: 20, marginTop: 14 }}>
                <div className="det-rotulo" style={{ marginBottom: 8 }}>{t('Como funciona')}</div>
                <ul className="muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, fontSize: 14 }}>
                    <li>{t('Seu amigo cria a conta pelo seu link.')}</li>
                    <li>{t('Quando ele mandar o primeiro currículo pelo Gmail conectado, vocês dois ganham +{n} envios por dia por {d} dias.', { n: regra.envios, d: regra.dias })}</li>
                    <li>{t('Cada amigo soma mais {d} dias, até {teto} dias de bônus.', { d: regra.dias, teto: regra.teto })}</li>
                    <li>{t('Vale para conta nova. A mesma pessoa com duas contas não conta.')}</li>
                </ul>
            </div>
        </div>
    );
}
