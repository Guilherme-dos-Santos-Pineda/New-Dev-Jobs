import { useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { useToast } from './Toast.jsx';

// Envio sem clique: só aparece para quem tem o plano, e só liga com a pessoa
// marcando aqui. Quem decide o que sai é services/autoEnvio.js.
export default function AutoEnvio() {
    const { t } = useT();
    const toast = useToast();
    const { user, refreshUser } = useAuth();
    const [ocupado, setOcupado] = useState(false);
    const trava = useRef(false);

    if (!user?.planLimits?.autoSend) return null;
    const pronto = user.googleConnected && user.hasCv;

    async function trocar(e) {
        const ativo = e.target.checked;
        if (trava.current) return;
        trava.current = true;
        setOcupado(true);
        try {
            await api.autoEnvio(ativo);
            await refreshUser();
            toast.show(ativo ? t('Envio automático ligado. O primeiro sai amanhã de manhã.') : t('Envio automático desligado.'));
        } catch (err) {
            toast.show(err.message, 'error');
        } finally {
            trava.current = false;
            setOcupado(false);
        }
    }

    return (
        <div className="card">
            <div className="sec-card-head"><h2 style={{ fontSize: 15 }}><i className="ti ti-clock-play" /> {t('Envio automático')}</h2></div>
            <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
                {t('Todo dia de manhã, seu currículo sai pelo seu Gmail para as vagas da última semana com 50% ou mais de compatibilidade, até o seu limite diário. Vaga antiga não entra.')}
            </p>
            <label className="row" style={{ alignItems: 'center', gap: 8, cursor: pronto ? 'pointer' : 'default', fontWeight: 400 }}>
                <input type="checkbox" checked={!!user.autoEnvio} disabled={ocupado || (!pronto && !user.autoEnvio)} onChange={trocar} />
                {t('Enviar sozinho todo dia')}
            </label>
            {!pronto && <div className="hint">{t('Conecte o Gmail e anexe o currículo para ligar.')}</div>}
        </div>
    );
}
