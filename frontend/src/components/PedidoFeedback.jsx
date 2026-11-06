import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// Aparece depois de 10 envios, para quem ainda não deixou feedback. Quem decide é
// o servidor (services/feedbackMural.js). "Agora não" cala 14 dias neste aparelho.
const CHAVE = 'feedbackAdiadoAte';
const PAUSA_MS = 14 * 24 * 60 * 60 * 1000;

function adiado() {
    try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; }
}

export default function PedidoFeedback() {
    const { t } = useT();
    const [pedir, setPedir] = useState(false);

    useEffect(() => {
        if (adiado()) return;
        api.feedbackPedir().then((r) => setPedir(!!r.pedir)).catch(() => {});
    }, []);

    if (!pedir) return null;

    function depois() {
        try { localStorage.setItem(CHAVE, String(Date.now() + PAUSA_MS)); } catch { /* sem armazenamento, só fecha */ }
        setPedir(false);
    }

    return (
        <div className="card vh-retorno">
            <div className="vh-retorno-txt">
                <div className="vh-retorno-titulo"><i className="ti ti-message-heart" /> {t('O que você está achando?')}</div>
                <div className="muted">{t('Você já mandou mais de 10 currículos. Conta como está sendo: seu relato aparece no mural e ajuda quem está chegando.')}</div>
            </div>
            <div className="vh-retorno-acoes">
                <Link className="btn primary sm" to="/app/feedback">{t('Deixar meu feedback')}</Link>
                <button className="link-sutil" onClick={depois}>{t('Agora não')}</button>
            </div>
        </div>
    );
}
