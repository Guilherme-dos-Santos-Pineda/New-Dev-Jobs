// Marca do New Dev Jobs.
//
// O símbolo é a figura encapuzada verde, a mesma do favicon e a mesma que o
// Google mostra na tela de consentimento do Gmail. Isso não é detalhe: a
// pessoa vê esse desenho no momento mais desconfiado do fluxo, quando decide
// dar acesso à conta dela, e reconhecer o símbolo ali é parte de confiar.
// Trocar aqui exige trocar em três lugares: public/favicon.png, pages/ e o
// Branding do Google Cloud. Se os três divergirem, a tela de consentimento
// passa a mostrar uma marca que a pessoa nunca viu.
//
// Usamos SÓ O SÍMBOLO ao lado do texto, nunca o logo completo: o arquivo
// original já traz "new_dev" escrito, e repetir isso ao lado de "New Dev Jobs"
// fica redundante e diz dois nomes diferentes. O lockup inteiro fica para onde
// a marca aparece sozinha (favicon, imagem de compartilhamento, Google).
// Importado como módulo, não referenciado por caminho absoluto: em produção o
// app é servido sob /app/, então "/marca.png" apontaria para a raiz do domínio
// e daria 404. O Vite reescreve o caminho e ainda põe hash no nome, o que
// resolve cache entre deploys.

import marca from '../assets/marca.png';

export function LogoMark({ size = 30 }) {
    return (
        <img
            src={marca}
            alt=""
            aria-hidden="true"
            width={Math.round(size * 1.41)}
            height={size}
            className="brand-mark-img"
            style={{ height: size }}
        />
    );
}

export default function Logo({ size = 26, className = '' }) {
    return (
        <span className={`brand-logo ${className}`}>
            <LogoMark size={size} />
            <span className="brand-word">New <b>Dev</b> Jobs</span>
        </span>
    );
}
