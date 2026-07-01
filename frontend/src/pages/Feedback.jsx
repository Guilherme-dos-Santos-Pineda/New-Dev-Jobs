import FeedbackSection from '../components/FeedbackSection.jsx';
import { useT } from '../lib/i18n.jsx';

export default function Feedback() {
    const { t } = useT();
    return (
        <div className="page" style={{ maxWidth: 760 }}>
            <div className="page-head">
                <h1>Feedback</h1>
                <p>O que a comunidade está achando da plataforma.</p>
            </div>

            {/* Acesso ao grupo da comunidade no WhatsApp */}
            <a className="card fade-in comm-banner" href="https://chat.whatsapp.com/KqCxMcuoALJHXd9I9VA6KG"
                target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
                <div className="kpi-ico" style={{ width: 38, height: 38, fontSize: 20, color: '#25D366' }}><i className="ti ti-brand-whatsapp" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{t('Venha fazer parte da comunidade')}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{t('Dicas de vagas, novidades e suporte no WhatsApp.')}</div>
                </div>
                <span className="btn primary sm" style={{ flexShrink: 0 }}><i className="ti ti-brand-whatsapp" /> {t('Entrar no grupo')}</span>
            </a>

            <FeedbackSection title={false} />
        </div>
    );
}
