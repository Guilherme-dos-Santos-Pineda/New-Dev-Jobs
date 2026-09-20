import { Link } from 'react-router-dom';
import { useT } from '../lib/i18n.jsx';

// =========================
// Primeiro acesso — o que é isto e o que fazer agora
// =========================
// Medido no banco: de 13 contas, 8 salvaram algum perfil, 5 preencheram skills e
// 3 chegaram a enviar. SETE pararam no mesmo ponto, com o mesmo buraco — sem
// skills, sem currículo, sem Gmail. Ou seja: criaram a conta, caíram no painel e
// não souberam o que fazer.
//
// A landing está convertendo (a pessoa chegou a se cadastrar). Quem perde é o
// app. Por isso este bloco:
//
// 1. Diz O QUE O PRODUTO FAZ antes de pedir qualquer coisa. O checklist antigo
//    abria com "Conclua sua configuração", que só faz sentido para quem já
//    entendeu que o sistema manda email por você.
// 2. Três passos, não quatro: "área" e "skills" viraram um só porque são a mesma
//    tela — pedir duas vezes faz a lista parecer maior do que é.
// 3. Só o PRÓXIMO passo tem botão em destaque. Lista inteira clicável divide a
//    atenção justamente de quem já não sabe por onde começar.

export default function Onboarding({ profile, user }) {
    const { t } = useT();

    const passos = [
        {
            // Este passo JÁ ESTÁ FEITO por definição: quem vê esta tela criou a
            // conta. Ele existe porque a barra abrir em "1 de 4" converte melhor
            // que abrir em "0 de 3", mesmo exigindo o mesmo trabalho: num
            // experimento de cartão fidelidade, 12 espaços com 2 carimbados
            // teve quase o dobro de conclusão de 10 espaços vazios (Nunes e
            // Drèze, 2006). Um caminho já começado se abandona menos.
            feito: true,
            titulo: 'Criar sua conta',
            porque: '',
            para: '/app',
            acao: '',
            minutos: 0,
        },
        {
            feito: !!profile?.areas?.length && !!profile?.skills?.length,
            titulo: 'Diga o que você faz',
            porque: 'Sua área e suas skills decidem quais vagas chegam até você, e quais nem aparecem.',
            para: '/app/perfil?section=work',
            acao: 'Preencher perfil',
            minutos: 2,
        },
        {
            feito: !!profile?.hasCv,
            titulo: 'Envie seu currículo em PDF',
            porque: 'É o arquivo que vai anexado em cada candidatura.',
            para: '/app/perfil?section=contact',
            acao: 'Enviar currículo',
            minutos: 1,
        },
        {
            feito: !!user?.googleConnected,
            titulo: 'Conecte seu Gmail',
            porque: 'Os emails saem da SUA conta, com o seu nome no remetente. O recrutador responde direto para você.',
            para: '/app/perfil?tab=email',
            acao: 'Conectar Gmail',
            minutos: 1,
        },
    ];

    const feitos = passos.filter((p) => p.feito).length;
    if (feitos === passos.length) return null;

    // O primeiro pendente é o único com botão cheio — os outros ficam visíveis
    // para a pessoa saber o tamanho do caminho, mas não competem pelo clique.
    const proximo = passos.findIndex((p) => !p.feito);
    const faltam = passos.length - feitos;
    const minutos = passos.filter((p) => !p.feito).reduce((s, p) => s + p.minutos, 0);

    return (
        <div className="card onb fade-in">
            <div className="onb-topo">
                <div>
                    <h2>{t('Como o New Dev Jobs funciona')}</h2>
                    <p>
                        {t('A gente garimpa vagas que recrutadores publicam soltas no LinkedIn. Muitas nunca chegam a job board nenhum. Você configura uma vez, e o sistema envia seu currículo para as compatíveis, do seu próprio Gmail.')}
                    </p>
                </div>
                <div className="onb-prog">
                    <span className="onb-frac">{feitos}<em>/{passos.length}</em></span>
                    <span className="muted">{t('{n} passo(s) · ~{m} min', { n: faltam, m: minutos })}</span>
                </div>
            </div>

            <ol className="onb-passos">
                {passos.map((p, i) => (
                    <li key={p.titulo} className={`${p.feito ? 'ok' : ''} ${i === proximo ? 'agora' : ''}`}>
                        <span className="onb-num">
                            {p.feito ? <i className="ti ti-check" /> : i + 1}
                        </span>
                        <div className="onb-txt">
                            <strong>{t(p.titulo)}</strong>
                            {!p.feito && p.porque && <span>{t(p.porque)}</span>}
                        </div>
                        {!p.feito && p.acao && (
                            <Link to={p.para} className={`btn sm ${i === proximo ? 'primary' : 'ghost'}`}>
                                {t(p.acao)}
                            </Link>
                        )}
                    </li>
                ))}
            </ol>

            {/* Some a dúvida mais comum antes de ela virar motivo para não conectar. */}
            <div className="onb-rodape">
                <i className="ti ti-lock" />
                <span>{t('Não lemos sua caixa de entrada. A permissão que pedimos é só a de ENVIAR, e você pode desconectar quando quiser.')}</span>
            </div>
        </div>
    );
}
