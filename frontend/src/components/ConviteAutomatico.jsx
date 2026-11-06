import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// Aparece a partir de 40 envios, para quem ainda não tem o envio automático. Quem
// decide é o servidor (deveConvidar). "Agora não" cala 14 dias neste aparelho.
const CHAVE = 'conviteAutoAdiadoAte';
const PAUSA_MS = 14 * 24 * 60 * 60 * 1000;

function adiado() {
    try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; }
}

export default function ConviteAutomatico() {
    const { t } = useT();
    const [convidar, setConvidar] = useState(false);

    useEffect(() => {
        if (adiado()) return;
        api.conviteAutomatico().then((r) => setConvidar(!!r.convidar)).catch(() => {});
    }, []);

    if (!convidar) return null;

    function depois() {
        try { localStorage.setItem(CHAVE, String(Date.now() + PAUSA_MS)); } catch { /* sem armazenamento, só fecha */ }
        setConvidar(false);
    }

    return (
        <div className="card vh-retorno">
            <div className="vh-retorno-txt">
                <div className="vh-retorno-titulo"><i className="ti ti-clock-play" /> {t('Ei, que tal a gente enviar por você?')}</div>
                <div className="muted">{t('Você já mandou mais de 40 currículos. Por R$ 10, as vagas novas recebem seu currículo todo dia, sem você precisar entrar, e seu limite sobe para 50 envios por dia.')}</div>
            </div>
            <div className="vh-retorno-acoes">
                <Link className="btn primary sm" to="/app/assinatura">{t('Quero o automático')}</Link>
                <button className="link-sutil" onClick={depois}>{t('Agora não')}</button>
            </div>
        </div>
    );
}
