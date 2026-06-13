import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { scoreClass, fmtDate } from '../utils.js';

export default function Applications() {
    const [apps, setApps] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            const { applications } = await api.getApplications();
            setApps(applications);
            setLoading(false);
        })();
    }, []);

    return (
        <div className="page">
            <div className="page-head">
                <h1>Candidaturas</h1>
                <p>Histórico de currículos enviados automaticamente.</p>
            </div>

            {loading ? (
                <div className="center" style={{ padding: 60 }}><div className="spinner" /></div>
            ) : apps.length === 0 ? (
                <div className="card empty">
                    <i className="ti ti-send" />
                    Você ainda não se candidatou a nenhuma vaga.
                    <div style={{ marginTop: 14 }}><Link to="/app/vagas" className="btn primary sm">Explorar vagas</Link></div>
                </div>
            ) : (
                <div className="job-list">
                    {apps.map((a) => (
                        <div key={a.id} className="card job-card">
                            <div className="job-logo"><i className="ti ti-building" /></div>
                            <div className="job-main">
                                <div className="job-title">{a.title || 'Vaga'}</div>
                                <div className="job-meta">{a.company} · enviado para {a.to}</div>
                                <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                                    <i className="ti ti-mail" /> {a.subject}
                                </div>
                            </div>
                            <div className="job-side">
                                <span className="badge ok"><i className="ti ti-circle-check" /> enviado</span>
                                <span className={`score ${scoreClass(a.matchScore)}`}>{a.matchScore}%</span>
                                <span className="muted" style={{ fontSize: 12 }}>{fmtDate(a.sentAt || a.createdAt)}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
