import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// Aparece UMA vez, depois de 10 envios, para quem ainda não deixou feedback. Quem
// decide é o servidor (services/feedbackMural.js). A marca é gravada ao mostrar, não
// ao fechar: o pedido não pode voltar todo dia para quem só ignorou.
const CHAVE = 'feedbackPedidoVisto';

function jaViu() {
    try { return !!localStorage.getItem(CHAVE); } catch { return true; }
}

export default function PedidoFeedback() {
    const { t } = useT();
    const [pedir, setPedir] = useState(false);

    useEffect(() => {
        if (jaViu()) return;
        api.feedbackPedir().then((r) => {
            if (!r.pedir) return;
            setPedir(true);
            try { localStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento, não chega aqui */ }
        }).catch(() => {});
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
                <button className="link-sutil" onClick={() => setPedir(false)}>{t('Agora não')}</button>
            </div>
        </div>
    );
}
