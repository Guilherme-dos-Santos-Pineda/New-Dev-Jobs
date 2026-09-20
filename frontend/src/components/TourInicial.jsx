import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useT } from '../lib/i18n.jsx';

// =========================
// Tour de primeiro acesso
// =========================
// Medido no banco: de 14 contas reais, SETE nunca chegaram a salvar um perfil.
// Elas criaram login, caíram no painel e não souberam o que fazer. O checklist
// que já existe (Onboarding.jsx) diz o que FALTA fazer; ele não diz o que cada
// parte da plataforma É. Este tour cobre esse buraco, uma vez só.
//
// Três decisões que vieram desse número:
//
// 1. SÓ APARECE PARA QUEM NÃO TEM PERFIL. Quem já configurou não é o problema,
//    e tour repetido em quem já sabe usar vira incômodo.
// 2. É DISPENSÁVEL EM UM CLIQUE, e a dispensa vale por usuário. Prender alguém
//    num carrossel obrigatório aumenta abandono justamente de quem já estava
//    inseguro.
// 3. O PASSO DO PERFIL É O DOBRO DOS OUTROS e é o único que termina em botão.
//    É ele que decide quais vagas chegam: sem área e skills, o filtro não tem
//    o que filtrar e a pessoa recebe ou tudo ou nada.

const CHAVE = 'tour-visto';

function jaViu(userId) {
    try { return localStorage.getItem(`${CHAVE}:${userId}`) === '1'; }
    catch { return false; }
}
function marcarVisto(userId) {
    // Por usuário: numa máquina compartilhada, o tour da conta A não pode
    // sumir para a conta B.
    try { localStorage.setItem(`${CHAVE}:${userId}`, '1'); } catch { /* modo privado */ }
}

export default function TourInicial({ profile, user }) {
    const { t } = useT();
    const navigate = useNavigate();
    const [passo, setPasso] = useState(0);
    const [aberto, setAberto] = useState(false);

    const temPerfil = !!profile?.areas?.length && !!profile?.skills?.length;

    useEffect(() => {
        if (!user?.id) return;
        if (temPerfil) return;
        if (jaViu(user.id)) return;
        setAberto(true);
    }, [user?.id, temPerfil]);

    // Esc fecha, como qualquer diálogo.
    useEffect(() => {
        if (!aberto) return undefined;
        const aoTeclar = (e) => { if (e.key === 'Escape') fechar(); };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    });

    function fechar() {
        if (user?.id) marcarVisto(user.id);
        setAberto(false);
    }

    function irParaPerfil() {
        fechar();
        navigate('/app/perfil?section=work');
    }

    if (!aberto) return null;

    const passos = [
        {
            titulo: t('O que o New Dev Jobs faz'),
            corpo: t('A gente garimpa vagas que recrutadores publicam soltas, muitas delas nunca viram anúncio em job board. O sistema compara cada vaga com o seu perfil e envia seu currículo pela SUA conta do Gmail, com o seu nome no remetente. O recrutador responde direto para você.'),
            nota: t('Você configura uma vez. Depois roda sozinho.'),
        },
        {
            titulo: t('Perfil: é aqui que tudo se decide'),
            corpo: t('Esta é a parte que mais importa, e é onde a maioria para. Sua área e suas skills decidem quais vagas chegam até você e quais nem aparecem. Sem elas, o filtro não tem o que filtrar.'),
            lista: [
                t('Área e skills definem o que entra no seu feed'),
                t('Senioridade e modalidade cortam o que não serve'),
                t('O currículo em PDF é o arquivo anexado em cada envio'),
                t('Conectar o Gmail é o que libera o envio de fato'),
            ],
            nota: t('Leva uns 4 minutos e é o único passo sem o qual nada acontece.'),
            destaque: true,
        },
        {
            titulo: t('Painel: o que está acontecendo'),
            corpo: t('O painel mostra quantas vagas entraram, quantas combinam com você e quantos envios ainda cabem no seu dia. Embaixo fica a lista de vagas remotas em destaque, que muda uma vez por dia e é a mesma para todo mundo.'),
            nota: t('Enviar pelos destaques gasta a mesma cota diária do envio automático.'),
        },
        {
            titulo: t('Candidaturas e cota'),
            corpo: t('Em Candidaturas fica o histórico de tudo que saiu, com o email de destino, o assunto e o score de compatibilidade. Em Assinatura você vê seu limite: o plano grátis manda 7 por dia, todo dia, sem cartão.'),
            nota: t('A mesma vaga nunca é enviada duas vezes, o banco não deixa.'),
        },
    ];

    const p = passos[passo];
    const ultimo = passo === passos.length - 1;

    return (
        <div className="modal-overlay" onClick={fechar}>
            <div
                className="modal tour"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="tour-titulo"
            >
                <div className="tour-topo">
                    <span className="tour-contagem">{passo + 1} / {passos.length}</span>
                    <button className="close" onClick={fechar} aria-label={t('Fechar')}>
                        <i className="ti ti-x" />
                    </button>
                </div>

                <div className={`tour-corpo ${p.destaque ? 'destaque' : ''}`}>
                    <h2 id="tour-titulo">{p.titulo}</h2>
                    <p>{p.corpo}</p>
                    {p.lista && (
                        <ul className="tour-lista">
                            {p.lista.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                    )}
                    {p.nota && <p className="tour-nota">{p.nota}</p>}
                </div>

                <div className="tour-pe">
                    <button className="btn ghost sm" onClick={fechar}>{t('Pular')}</button>
                    <span className="tour-pontos" aria-hidden="true">
                        {passos.map((_, i) => <i key={i} className={i === passo ? 'agora' : ''} />)}
                    </span>
                    {passo > 0 && (
                        <button className="btn ghost sm" onClick={() => setPasso((n) => n - 1)}>{t('Voltar')}</button>
                    )}
                    {ultimo ? (
                        <button className="btn primary sm" onClick={irParaPerfil}>{t('Configurar meu perfil')}</button>
                    ) : (
                        <button className="btn primary sm" onClick={() => setPasso((n) => n + 1)}>{t('Próximo')}</button>
                    )}
                </div>
            </div>
        </div>
    );
}
