import FeedbackSection from '../components/FeedbackSection.jsx';

export default function Feedback() {
    return (
        <div className="page" style={{ maxWidth: 760 }}>
            <div className="page-head">
                <h1>Feedback</h1>
                <p>O que a comunidade está achando da plataforma.</p>
            </div>
            <FeedbackSection title={false} />
        </div>
    );
}
