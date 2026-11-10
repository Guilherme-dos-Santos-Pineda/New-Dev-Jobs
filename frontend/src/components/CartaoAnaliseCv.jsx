import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// Divulga "Melhorar meu currículo" em Vagas. Só no perfil, a entrada ficou
// escondida dentro do cartão do currículo e o próprio dono não achou (10/11/2026).
// Some depois da primeira análise ou do "Agora não" (só naquele aparelho).
const CHAVE = 'cartaoAnaliseCvFechado';

function fechado() {
    try { return !!localStorage.getItem(CHAVE); } catch { return false; }
}

export default function CartaoAnaliseCv() {
    const { t } = useT();
    const [estado, setEstado] = useState(null);
    const [oculto, setOculto] = useState(fechado);

    useEffect(() => {
        if (oculto) return;
        api.analiseCv().then(setEstado).catch(() => {});
    }, [oculto]);

    if (oculto || !estado?.disponivel || estado.ultima || estado.restantes === 0) return null;

    function agoraNao() {
        try { localStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento: some só nesta visita */ }
        setOculto(true);
    }

    return (
        <div className="card vh-retorno" style={{ marginBottom: 14 }}>
            <div className="vh-retorno-txt">
                <div className="vh-retorno-titulo"><i className="ti ti-sparkles" /> {t('Novo: melhore seu currículo com IA')} <span className="badge info">{t('Em teste')}</span></div>
                <div className="muted">{t('Nota, o que falta para as suas vagas e o currículo reescrito para os sistemas de triagem. Grátis durante o teste.')}</div>
            </div>
            <div className="vh-retorno-acoes">
                <Link className="btn primary sm" to="/app/curriculo">{t('Analisar meu currículo')}</Link>
                <button className="btn sm ghost" onClick={agoraNao}>{t('Agora não')}</button>
            </div>
        </div>
    );
}
