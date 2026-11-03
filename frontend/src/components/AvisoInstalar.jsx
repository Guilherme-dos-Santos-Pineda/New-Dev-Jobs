import { useEffect, useState } from 'react';
import { useT } from '../lib/i18n.jsx';
import { useInstalarApp } from '../lib/instalarApp.js';

// Cartão "dá para instalar o app", acima da barra de baixo do celular.
//
// Só no celular: no computador o Chrome já põe o ícone de instalar na barra de
// endereço, e um aviso a mais ali é ruído. Aparece alguns segundos depois de
// abrir (não no primeiro paint, competindo com a tela), e "Agora não" cala o
// aviso por 30 dias. Quem quiser antes continua tendo "Instalar app" no menu do nome.
const CHAVE = 'avisoInstalarAte';
const PAUSA_MS = 30 * 24 * 60 * 60 * 1000;

function silenciado() {
    try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; }
}

export default function AvisoInstalar() {
    const { t } = useT();
    const app = useInstalarApp();
    const [pronto, setPronto] = useState(false);
    const [fechado, setFechado] = useState(silenciado);

    useEffect(() => {
        const timer = setTimeout(() => setPronto(true), 4000);
        return () => clearTimeout(timer);
    }, []);

    const celular = typeof window !== 'undefined' && window.matchMedia?.('(max-width: 900px)').matches;
    if (!pronto || fechado || !app.mostrar || !celular) return null;

    const calar = () => {
        try { localStorage.setItem(CHAVE, String(Date.now() + PAUSA_MS)); } catch { /* modo privado */ }
        setFechado(true);
    };
    const instalar = async () => {
        const ok = await app.instalar();
        if (ok) setFechado(true);
    };

    return (
        <div className="aviso-instalar" role="dialog" aria-label={t('Instalar app')}>
            <img src={`${import.meta.env.BASE_URL}icon-192.png`} alt="" width="44" height="44" />
            <div className="ai-texto">
                <b>{t('Instale o New Dev Jobs no celular')}</b>
                {app.ios
                    ? <span>{t('Toque em Compartilhar e depois em "Adicionar à Tela de Início".')}</span>
                    : <span>{t('Abre direto da tela inicial, em tela cheia, sem procurar o site.')}</span>}
                <div className="ai-acoes">
                    {app.ios
                        ? <button className="btn sm primary" onClick={calar}>{t('Entendi')}</button>
                        : <>
                            <button className="btn sm primary" onClick={instalar}>{t('Instalar')}</button>
                            <button className="btn sm ghost" onClick={calar}>{t('Agora não')}</button>
                        </>}
                </div>
            </div>
            <button className="ai-fechar" onClick={calar} aria-label={t('Fechar')}><i className="ti ti-x" /></button>
        </div>
    );
}
