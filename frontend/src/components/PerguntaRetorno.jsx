import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';
import { useToast } from './Toast.jsx';

// "Alguém te respondeu?", 14 dias depois do primeiro envio. A permissão do Gmail
// é só de enviar, então esta é a única forma de saber se o produto funciona.
// Quem decide quando perguntar é o servidor (services/retornoEnvios.js). "Agora
// não" cala só neste aparelho, por 7 dias, sem gravar resposta.
const CHAVE = 'retornoAdiadoAte';
const PAUSA_MS = 7 * 24 * 60 * 60 * 1000;

function adiado() {
    try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; }
}

export default function PerguntaRetorno() {
    const { t } = useT();
    const toast = useToast();
    const [perguntar, setPerguntar] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const trava = useRef(false);

    useEffect(() => {
        if (adiado()) return;
        api.retorno().then((r) => setPerguntar(!!r.perguntar)).catch(() => {});
    }, []);

    if (!perguntar) return null;

    const agradecimento = {
        nada: t('Obrigado por contar. Isso ajuda a gente a melhorar.'),
        sim: t('Que bom! Obrigado por contar.'),
        emprego: t('Parabéns pelo emprego! Essa é a melhor notícia que a gente pode receber.'),
    };

    async function responder(resposta) {
        if (trava.current) return;
        trava.current = true;
        setOcupado(true);
        try {
            await api.responderRetorno(resposta);
            setPerguntar(false);
            toast.show(agradecimento[resposta]);
        } catch (e) {
            toast.show(e.message, 'error');
        } finally {
            trava.current = false;
            setOcupado(false);
        }
    }

    function depois() {
        try { localStorage.setItem(CHAVE, String(Date.now() + PAUSA_MS)); } catch { /* sem armazenamento, só fecha */ }
        setPerguntar(false);
    }

    return (
        <div className="card vh-retorno">
            <div className="vh-retorno-txt">
                <div className="vh-retorno-titulo"><i className="ti ti-message-circle" /> {t('Algum recrutador te respondeu?')}</div>
                <div className="muted">{t('A gente não vê sua caixa de entrada, então só sabe se você contar.')}</div>
            </div>
            <div className="vh-retorno-acoes">
                <button className="btn sm" disabled={ocupado} onClick={() => responder('nada')}>{t('Ainda não')}</button>
                <button className="btn sm" disabled={ocupado} onClick={() => responder('sim')}>{t('Sim, responderam')}</button>
                <button className="btn primary sm" disabled={ocupado} onClick={() => responder('emprego')}>{t('Consegui emprego')}</button>
                <button className="link-sutil" disabled={ocupado} onClick={depois}>{t('Agora não')}</button>
            </div>
        </div>
    );
}
