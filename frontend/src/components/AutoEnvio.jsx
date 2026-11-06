import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useT } from '../lib/i18n.jsx';
import { useToast } from './Toast.jsx';

// Envio sem clique: só aparece para quem tem o plano, e só liga com a pessoa
// apertando aqui. Diz sempre o estado, a hora e o próximo envio: a primeira versão
// era uma caixinha no meio do perfil, e nem o dono achou depois de comprar.
// Quem decide o que sai é services/autoEnvio.js.

function quando(ms, t) {
    if (!ms) return '';
    const dia = (d) => new Date(d).toLocaleDateString('pt-BR');
    if (dia(ms) === dia(Date.now())) return t('hoje às 9h');
    if (dia(ms) === dia(Date.now() + 86400000)) return t('amanhã às 9h');
    return t('{dia} às 9h', { dia: dia(ms) });
}

export default function AutoEnvio({ style }) {
    const { t } = useT();
    const toast = useToast();
    const { user, refreshUser } = useAuth();
    const [ocupado, setOcupado] = useState(false);
    const trava = useRef(false);

    if (!user?.planLimits?.autoSend) return null;
    const ligado = !!user.autoEnvio;
    const pronto = user.googleConnected && user.hasCv;

    async function trocar() {
        if (trava.current) return;
        trava.current = true;
        setOcupado(true);
        try {
            await api.autoEnvio(!ligado);
            await refreshUser();
            toast.show(ligado ? t('Envio automático desligado.') : t('Envio automático ligado.'));
        } catch (err) {
            toast.show(err.message, 'error');
        } finally {
            trava.current = false;
            setOcupado(false);
        }
    }

    return (
        <div className="card vh-retorno" style={{ borderColor: ligado ? 'var(--color-accent)' : undefined, ...style }}>
            <div className="vh-retorno-txt">
                <div className="vh-retorno-titulo">
                    <i className={`ti ${ligado ? 'ti-circle-check' : 'ti-clock-play'}`} /> {ligado ? t('Envio automático ligado') : t('Envio automático desligado')}
                </div>
                <div className="muted">
                    {ligado
                        ? t('Próximo envio: {quando}, horário de Brasília. Sai pelo seu Gmail, para as vagas da última semana com 50% ou mais de compatibilidade, até o seu limite do dia. O que sair aparece em Enviadas.', { quando: quando(user.autoEnvioProximo, t) })
                        : t('Ligue e seu currículo sai sozinho todo dia às 9h, horário de Brasília, sem você precisar entrar. Só vai para vagas da última semana com 50% ou mais de compatibilidade.')}
                </div>
                {!pronto && !ligado && <div className="hint">{t('Antes de ligar, conecte o Gmail e anexe o currículo.')}</div>}
            </div>
            <div className="vh-retorno-acoes">
                {pronto || ligado ? (
                    <button className={`btn sm ${ligado ? 'ghost' : 'primary'}`} disabled={ocupado} onClick={trocar}>
                        {ocupado ? '…' : ligado ? t('Desligar') : t('Ligar envio automático')}
                    </button>
                ) : (
                    <Link className="btn primary sm" to="/app/perfil">{t('Completar meu perfil')}</Link>
                )}
            </div>
        </div>
    );
}
