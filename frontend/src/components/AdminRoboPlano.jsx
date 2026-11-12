import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { fmtDate } from '../utils.js';

// Admin › Robô dos pagantes: responde "o robô está trabalhando por quem pagou?".
// Um robô só para todos os compradores (backend/services/roboDoPlano.js): as buscas
// de cada pessoa entram num rodízio diário e ele visita os recrutadores das áreas
// deles. As vagas vão para a base comum, então não é "um robô só seu".

function Numero({ valor, rotulo, alerta }) {
    return (
        <div className="card" style={{ padding: 14, flex: '1 1 140px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: alerta ? 'var(--color-danger)' : undefined }}>{valor}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{rotulo}</div>
        </div>
    );
}

export default function AdminRoboPlano() {
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState('');

    function carregar() {
        setErro('');
        api.adminRoboPlano().then(setDados).catch((e) => setErro(e.message));
    }
    useEffect(carregar, []);

    if (erro) return <div className="card"><p style={{ color: 'var(--color-danger)' }}>{erro}</p><button className="btn sm" onClick={carregar}>Tentar de novo</button></div>;
    if (!dados) return <div className="card"><div className="muted">Carregando…</div></div>;

    const ultima = dados.execucoes[0];
    const poucasVagas = dados.pessoas.filter((p) => p.vagas && p.vagas.total < 50).length;

    return (
        <div>
            <div className="card" style={{ marginBottom: 14 }}>
                <h2 style={{ fontSize: 16, marginBottom: 6 }}>O robô está trabalhando por quem pagou?</h2>
                <p className="muted" style={{ fontSize: 13 }}>
                    É um robô só, que todo dia monta as buscas pelo perfil de cada pagante e visita os recrutadores que mais postam nas áreas deles.
                    As vagas que ele acha entram na base de todos: quem pagou recebe primeiro pelo envio automático, mas elas não são exclusivas.
                </p>
                <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                    {dados.robo
                        ? <span className={`badge ${dados.robo.ativo ? 'ok' : 'danger'}`}>{dados.robo.ativo ? 'Ligado' : 'Desligado'}</span>
                        : <span className="badge danger">Robô não encontrado</span>}
                    {dados.robo?.ultima && <span className="muted" style={{ fontSize: 12.5 }}>Última execução: {fmtDate(dados.robo.ultima)}</span>}
                    {dados.robo?.proxima && <span className="muted" style={{ fontSize: 12.5 }}>Próxima: {fmtDate(dados.robo.proxima)}</span>}
                    <span className="muted" style={{ fontSize: 12.5 }}>Ligar, desligar e mudar horário: aba Robôs.</span>
                </div>
            </div>

            <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <Numero valor={dados.pessoas.length} rotulo="pagantes com o robô" />
                <Numero valor={`${dados.buscasHoje} de ${dados.tetoBuscas}`} rotulo="buscas no rodízio de hoje" />
                <Numero valor={`${dados.recrutadoresHoje} de ${dados.recrutadoresPorDia}`} rotulo="recrutadores visitados por dia" />
                <Numero valor={ultima ? (ultima.vagasNovas ?? 0) : 0} rotulo="vagas novas na última execução" />
                <Numero valor={poucasVagas} rotulo="pagantes com menos de 50 vagas" alerta={poucasVagas > 0} />
            </div>

            <div className="card" style={{ marginBottom: 14 }}>
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Por pagante</h3>
                {dados.pessoas.length === 0 && <div className="muted">Nenhum pagante com plano ativo.</div>}
                {dados.pessoas.map((p) => (
                    <div key={p.userId} style={{ padding: '10px 0', borderTop: '1px solid var(--color-border)' }}>
                        <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'baseline' }}>
                            <strong>{p.nome || p.email}</strong>
                            <span className="muted" style={{ fontSize: 12.5 }}>{p.email}</span>
                            <span className="badge info">{p.plano}</span>
                            {!p.pagou && <span className="badge warn">concessão</span>}
                            <span className={`badge ${p.autoEnvio ? 'ok' : 'warn'}`}>{p.autoEnvio ? 'automático ligado' : 'automático desligado'}</span>
                            {p.expira && <span className="muted" style={{ fontSize: 12.5 }}>vence {fmtDate(p.expira)}</span>}
                        </div>
                        <div className="muted" style={{ fontSize: 12.5, margin: '4px 0' }}>
                            Áreas: {p.areas.join(', ') || 'nenhuma'} · Nível: {p.niveis.join(', ') || 'qualquer'}
                            {p.vagas
                                ? <> · <span style={{ color: p.vagas.total < 50 ? 'var(--color-danger)' : undefined }}>{p.vagas.total} vagas no perfil</span>, {p.vagas.semana} da semana, {p.vagas.mes} do mês</>
                                : ' · não deu para contar as vagas'}
                        </div>
                        <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                            {p.buscas.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>Sem busca: o perfil não tem área nem skill.</span>}
                            {p.buscas.map((b) => (
                                <span key={b.busca} className={`chip ${b.hoje ? '' : 'muted'}`} title={b.hoje ? 'Roda hoje' : 'Fora do rodízio de hoje'}>
                                    {b.hoje && <i className="ti ti-check" />} {b.busca}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <div className="card">
                <h3 style={{ fontSize: 14, marginBottom: 10 }}>Últimas execuções</h3>
                {dados.execucoes.length === 0 && <div className="muted">Nenhuma execução ainda.</div>}
                {dados.execucoes.map((x) => (
                    <div key={x.id} className="row" style={{ gap: 10, padding: '6px 0', borderTop: '1px solid var(--color-border)', fontSize: 13, flexWrap: 'wrap' }}>
                        <span style={{ minWidth: 120 }}>{fmtDate(x.em)}</span>
                        <span className={`badge ${x.status === 'done' ? 'ok' : x.status === 'failed' ? 'danger' : 'warn'}`}>{x.status}</span>
                        {x.semFolga
                            ? <span className="muted">pulou: pouco crédito na Apify</span>
                            : <span className="muted">{x.posts ?? 0} posts lidos, {x.vagasNovas ?? 0} vagas novas, {x.recrutadores ?? 0} recrutadores visitados</span>}
                    </div>
                ))}
            </div>
        </div>
    );
}
