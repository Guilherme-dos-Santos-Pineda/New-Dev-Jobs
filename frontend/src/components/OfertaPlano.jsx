import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useT } from '../lib/i18n.jsx';

// =========================
// Oferta do plano em Vagas: promoção e renovação (19/11/2026)
// =========================
// Duas situações, um cartão só:
//   - promoção em vigor (backend/config/promocao.js) e a pessoa não tem o Automático:
//     a oferta, com o que o plano dá de verdade;
//   - a pessoa tem o Automático: pagamento único não renova sozinho, então avisa.
//     Na promoção, renovar já (os dias somam); fora dela, só nos últimos 5 dias.
// "Agora não" cala 3 dias neste aparelho.
const CHAVE = 'ofertaPlanoAte';
const PAUSA_MS = 3 * 24 * 60 * 60 * 1000;
const DIA_MS = 86400000;

function adiado() {
    try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now(); } catch { return false; }
}

/** "30/11", no horário de Brasília. */
export function diaDoFim(promocao) {
    try { return new Date(promocao.fim).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' }); }
    catch { return ''; }
}

export default function OfertaPlano() {
    const { t } = useT();
    const { user } = useAuth();
    const [fechado, setFechado] = useState(adiado);
    if (fechado || !user) return null;

    const promo = user.promocao;
    const temAutomatico = !!user.planLimits?.autoSend;
    const renovavel = temAutomatico && user.plan === 'starter' && !!user.planExpiresAt;
    const diasRestantes = renovavel ? Math.max(0, Math.ceil((user.planExpiresAt - Date.now()) / DIA_MS)) : null;
    const dias = 30 + (promo?.diasExtra || 0);

    let titulo, texto, botao;
    if (promo && !temAutomatico && user.podeComprar) {
        titulo = t('{nome}: o Automático por {dias} dias, pelo preço de 30', { nome: promo.nome, dias });
        texto = t('R$ 10, pagamento único, até {fim}. Seu currículo sai sozinho todo dia às 9h, até 50 envios por dia, um robô busca vagas novas pelo seu perfil e a IA monta um currículo para cada tipo de vaga.', { fim: diaDoFim(promo) });
        botao = t('Quero os {dias} dias', { dias });
    } else if (renovavel && promo) {
        titulo = t('{nome}: renove e ganhe {dias} dias', { nome: promo.nome, dias });
        texto = t('Seu Automático acaba em {n} dias. Renovando até {fim}, são {dias} dias pelo mesmo R$ 10, somados aos que faltam.', { n: diasRestantes, fim: diaDoFim(promo), dias });
        botao = t('Renovar com {dias} dias', { dias });
    } else if (renovavel && diasRestantes <= 5) {
        titulo = diasRestantes === 0 ? t('Seu Automático acaba hoje') : t('Seu Automático acaba em {n} dias', { n: diasRestantes });
        texto = t('O pagamento é único e não renova sozinho. Renovando agora, os 30 dias somam aos que faltam e o envio das 9h não para.');
        botao = t('Renovar');
    } else return null;

    function depois() {
        try { localStorage.setItem(CHAVE, String(Date.now() + PAUSA_MS)); } catch { /* sem armazenamento: só fecha */ }
        setFechado(true);
    }

    return (
        <div className="card vh-retorno oferta-plano">
            <div className="vh-retorno-txt">
                <div className="vh-retorno-titulo"><i className={`ti ${promo ? 'ti-discount' : 'ti-refresh'}`} /> {titulo}</div>
                <div className="muted">{texto}</div>
            </div>
            <div className="vh-retorno-acoes">
                <Link className="btn primary sm" to="/app/assinatura">{botao}</Link>
                <button className="link-sutil" onClick={depois}>{t('Agora não')}</button>
            </div>
        </div>
    );
}
