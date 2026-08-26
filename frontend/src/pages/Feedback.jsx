import FeedbackSection from '../components/FeedbackSection.jsx';
import { useT } from '../lib/i18n.jsx';
import CommunityBanner from '../components/CommunityBanner.jsx';

export default function Feedback() {
    const { t } = useT();
    return (
        <div className="page" style={{ maxWidth: 760 }}>
            <div className="page-head">
                <h1>Feedback</h1>
                <p>{t('O que a comunidade está achando da plataforma.')}</p>
            </div>

            {/* Acesso ao grupo da comunidade no WhatsApp (dispensável) */}
            <CommunityBanner variant="button" style={{ marginBottom: 18 }} />

            <FeedbackSection title={false} />
        </div>
    );
}
