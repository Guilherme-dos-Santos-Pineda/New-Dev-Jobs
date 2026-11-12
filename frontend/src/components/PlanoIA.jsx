import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// O estado da IA da pessoa, no topo de Currículo IA (backend/services/iaLogic.js):
// teste de 48 h (1 análise e 1 currículo adaptado), plano de IA (R$ 5, 30 dias,
// 10 usos, ou junto do Automático) ou teste acabado. Sempre diz o que dá para
// fazer agora e, quando cabe, oferece liberar.
const quando = (ms) => new Date(ms).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function PlanoIA({ ia }) {
    const { t } = useT();
    const [indo, setIndo] = useState(false);
    const [erro, setErro] = useState('');
    const trava = useRef(false);
    if (!ia || ia.modo === 'admin') return null;

    async function comprar() {
        if (trava.current) return;
        trava.current = true;
        setIndo(true);
        setErro('');
        try {
            const { url } = await api.checkoutIa();
            window.location.href = url;
        } catch (e) {
            setErro(e.message);
            setIndo(false);
            trava.current = false;
        }
    }

    const botao = (
        <button className="btn primary sm" disabled={indo} onClick={comprar}>
            <i className="ti ti-sparkles" /> {indo ? t('Abrindo o pagamento…') : t('Liberar a IA por R$ 5')}
        </button>
    );

    let icone = 'ti-gift';
    let titulo;
    let texto;
    let comprarAqui = false;
    if (ia.modo === 'novo') {
        titulo = t('Teste grátis de 48 horas');
        texto = t('Comece quando quiser: a partir do primeiro uso, você tem 48 horas para 1 análise e 1 currículo adaptado a um tipo de vaga.');
    } else if (ia.modo === 'teste') {
        titulo = t('Teste grátis até {quando}', { quando: quando(ia.ate) });
        texto = t('Restam {a} análise(s) e {v} currículo(s) adaptado(s). Depois, a IA fica por R$ 5: 30 dias e 10 usos.', { a: ia.analisesRestantes, v: ia.versoesRestantes });
        comprarAqui = true;
    } else if (ia.modo === 'plano') {
        icone = 'ti-sparkles';
        titulo = t('IA liberada até {quando}', { quando: new Date(ia.ate).toLocaleDateString() });
        texto = ia.restantes > 0
            ? t('Restam {n} de 10 usos (análises e currículos adaptados somam). Suas versões aprovadas vão nos envios.', { n: ia.restantes })
            : t('Você usou os 10 usos deste período. As versões aprovadas continuam indo nos envios.');
        comprarAqui = ia.restantes === 0;
    } else {
        icone = 'ti-lock';
        titulo = t('Seu teste grátis acabou');
        texto = t('Libere a IA por R$ 5: 30 dias, 10 usos entre análises e currículos adaptados, e as versões aprovadas vão nos seus envios. Pagamento único, sem renovação automática.');
        comprarAqui = true;
    }

    return (
        <div className={`card plano-ia plano-ia-${ia.modo}`}>
            <div className="plano-ia-txt">
                <div className="plano-ia-titulo"><i className={`ti ${icone}`} /> {titulo}</div>
                <div className="muted">{texto}</div>
                {erro && <div className="cv-erro">{erro}</div>}
            </div>
            {comprarAqui && botao}
        </div>
    );
}
