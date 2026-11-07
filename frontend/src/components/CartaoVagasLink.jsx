import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';

// Porta de entrada das vagas por link: o menu fica com três itens de propósito.
export default function CartaoVagasLink() {
    const { t } = useT();
    const [total, setTotal] = useState(0);

    useEffect(() => {
        api.vagasPorLink().then((r) => setTotal(r.total || 0)).catch(() => {});
    }, []);

    if (!total) return null;

    return (
        <div className="card vh-retorno" style={{ marginBottom: 14 }}>
            <div className="vh-retorno-txt">
                <div className="vh-retorno-titulo"><i className="ti ti-link" /> {t('Mais {n} vagas para você', { n: total })}</div>
                <div className="muted">{t('Não têm email: a candidatura é pelo link do post, e não gasta seus envios do dia.')}</div>
            </div>
            <div className="vh-retorno-acoes">
                <Link className="btn sm" to="/app/links">{t('Ver vagas por link')}</Link>
            </div>
        </div>
    );
}
