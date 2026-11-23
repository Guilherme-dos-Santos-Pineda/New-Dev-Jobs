import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useT } from '../lib/i18n.jsx';
import { useToast } from './Toast.jsx';
import { suportado, permissao, iphoneSemApp, inscritoAqui, ativar, desativar } from '../lib/notificacoes.js';

// =========================
// Notificações no celular: o cartão do perfil e o convite em Vagas
// =========================
// `modo="convite"`: cartão pequeno em Vagas, só para quem ainda não decidiu
// (permissão "default") neste aparelho. "Agora não" cala 14 dias.
// Sem `modo`: o cartão completo do perfil, com cada tipo de aviso.
const TIPOS = [
    ['vagas', 'Vagas novas pro seu perfil', 'No máximo uma vez por dia, ao meio-dia, e só quando entrar vaga.'],
    ['envio', 'Seu envio das 9h começou', 'Para quem tem o envio automático ligado.'],
    ['plano', 'Seu plano está acabando', '3 dias antes, na véspera e no dia.'],
    ['indicacao', 'Sua indicação deu certo', 'Quando o amigo manda o primeiro currículo.'],
];
const CHAVE_CONVITE = 'conviteNotifAte';

function conviteAdiado() {
    try { return Number(localStorage.getItem(CHAVE_CONVITE) || 0) > Date.now(); } catch { return false; }
}

export default function Notificacoes({ modo }) {
    const { t } = useT();
    const toast = useToast();
    const [estado, setEstado] = useState(null);
    const [aqui, setAqui] = useState(false);
    const [fechado, setFechado] = useState(conviteAdiado);
    const trava = useRef(false);

    useEffect(() => {
        api.pushEstado().then(setEstado).catch(() => setEstado(null));
        inscritoAqui().then(setAqui);
    }, []);

    if (!estado?.chave) return null;
    const podeAqui = suportado();

    async function ligar() {
        if (trava.current) return;
        trava.current = true;
        try {
            await ativar(estado.chave);
            setAqui(true);
            setEstado((e) => ({ ...e, aparelhos: (e?.aparelhos || 0) + 1 }));
            toast.show(t('Pronto! Você vai ser avisado aqui neste aparelho.'));
            api.pushTeste().catch(() => {});
        } catch (e) { toast.show(e.message, 'error'); }
        finally { trava.current = false; }
    }

    async function desligar() {
        await desativar();
        setAqui(false);
        toast.show(t('Este aparelho não recebe mais notificações.'));
    }

    async function mudarTipo(tipo, valor) {
        try {
            const r = await api.pushPrefs({ [tipo]: valor });
            setEstado((e) => ({ ...e, prefs: r.prefs }));
        } catch (e) { toast.show(e.message, 'error'); }
    }

    if (modo === 'convite') {
        if (fechado || !podeAqui || permissao() !== 'default') return null;
        const depois = () => {
            try { localStorage.setItem(CHAVE_CONVITE, String(Date.now() + 14 * 86400000)); } catch { /* sem armazenamento: só fecha */ }
            setFechado(true);
        };
        return (
            <div className="card vh-retorno">
                <div className="vh-retorno-txt">
                    <div className="vh-retorno-titulo"><i className="ti ti-bell-ringing" /> {t('Quer ser avisado quando chegar vaga nova?')}</div>
                    <div className="muted">{t('Uma notificação por dia, só quando entrar vaga pro seu perfil. Dá para desligar quando quiser.')}</div>
                </div>
                <div className="vh-retorno-acoes">
                    <button className="btn primary sm" onClick={ligar}>{t('Ativar avisos')}</button>
                    <button className="link-sutil" onClick={depois}>{t('Agora não')}</button>
                </div>
            </div>
        );
    }

    return (
        <div className="card">
            <div className="sec-card-head">
                <h2 style={{ fontSize: 15 }}><i className="ti ti-bell" /> {t('Notificações no celular')}</h2>
            </div>
            {!podeAqui ? (
                <p className="muted" style={{ fontSize: 13 }}>
                    {iphoneSemApp()
                        ? t('No iPhone, as notificações só funcionam com o app na tela de início: toque em Compartilhar e depois em "Adicionar à Tela de Início".')
                        : t('Este navegador não recebe notificações.')}
                </p>
            ) : aqui ? (
                <div className="row" style={{ alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                    <span className="badge ok"><i className="ti ti-check" /> {t('Ligadas neste aparelho')}</span>
                    <button className="btn ghost sm" onClick={() => api.pushTeste().then(() => toast.show(t('Mandamos um aviso de teste.'))).catch(() => {})}>{t('Mandar um teste')}</button>
                    <button className="link-sutil" onClick={desligar}>{t('Desligar neste aparelho')}</button>
                </div>
            ) : (
                <div style={{ marginBottom: 12 }}>
                    <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
                        {permissao() === 'denied'
                            ? t('As notificações estão bloqueadas neste navegador. Libere nas configurações do site para ativar.')
                            : t('Receba no celular quando chegar vaga nova pro seu perfil.')}
                    </p>
                    {permissao() !== 'denied' && <button className="btn primary sm" onClick={ligar}><i className="ti ti-bell-ringing" /> {t('Ativar neste aparelho')}</button>}
                </div>
            )}
            {(aqui || estado.aparelhos > 0) && (
                <div style={{ display: 'grid', gap: 8 }}>
                    {TIPOS.map(([tipo, titulo, sub]) => (
                        <label key={tipo} className="row" style={{ alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                            <input type="checkbox" checked={!!estado.prefs?.[tipo]} onChange={(e) => mudarTipo(tipo, e.target.checked)} style={{ marginTop: 3 }} />
                            <span>{t(titulo)}<span className="muted" style={{ display: 'block', fontSize: 12 }}>{t(sub)}</span></span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
