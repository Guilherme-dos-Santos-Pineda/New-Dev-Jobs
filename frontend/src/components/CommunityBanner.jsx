import { useState } from 'react';
import { useT } from '../lib/i18n.jsx';

// Banner do grupo no WhatsApp. Vivia duplicado em Dashboard.jsx e Feedback.jsx;
// centralizado aqui para o "dispensar" valer nos dois lugares de uma vez.
//
// O card NÃO é mais um <a> envolvendo tudo: botão dentro de link é HTML inválido
// e o clique no X acabaria abrindo o WhatsApp. Agora o link cobre só o conteúdo
// e o X é irmão dele.
const GROUP_URL = 'https://chat.whatsapp.com/KqCxMcuoALJHXd9I9VA6KG';
const KEY = 'commBanner';   // 'dismissed' = usuário fechou

export default function CommunityBanner({ variant = 'arrow', style }) {
    const { t } = useT();
    // Lê uma vez na montagem (mesmo padrão do tema e da sidebar no Layout).
    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(KEY) === 'dismissed'; } catch { return false; }
    });

    if (dismissed) return null;

    const dismiss = () => {
        try { localStorage.setItem(KEY, 'dismissed'); } catch { /* modo privado: some só nesta sessão */ }
        setDismissed(true);
    };

    return (
        <div className="card fade-in comm-banner" style={{ display: 'flex', alignItems: 'center', gap: 12, ...style }}>
            <a
                className="comm-banner-link"
                href={GROUP_URL}
                target="_blank"
                rel="noopener"
                style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
            >
                <div className="kpi-ico" style={{ width: 38, height: 38, fontSize: 20, color: '#25D366' }}>
                    <i className="ti ti-brand-whatsapp" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t('Venha fazer parte da comunidade')}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{t('Dicas de vagas, novidades e suporte no WhatsApp.')}</div>
                </div>
                {variant === 'button' ? (
                    <span className="btn primary sm" style={{ flexShrink: 0 }}>
                        <i className="ti ti-brand-whatsapp" /> {t('Entrar no grupo')}
                    </span>
                ) : (
                    <i className="ti ti-arrow-right" style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                )}
            </a>

            <button
                type="button"
                className="comm-banner-close"
                onClick={dismiss}
                aria-label={t('Dispensar')}
                title={t('Dispensar')}
            >
                <i className="ti ti-x" aria-hidden="true" />
            </button>
        </div>
    );
}
