// Marca do New Dev Jobs: um avião de papel, que é o envio.
//
// A silhueta é a MESMA do favicon.svg e a mesma que o Google mostra na tela de
// consentimento do Gmail. Isso não é detalhe: a pessoa vê esse desenho no
// momento mais desconfiado do fluxo, quando decide dar acesso à conta dela, e
// reconhecer o símbolo ali é parte de confiar. Se mudar aqui, mude no
// favicon.svg (raiz de pages/ e de frontend/public/) e no Branding do Google
// Cloud, senão os três param de bater.
export function LogoMark({ size = 32 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <rect x="2" y="2" width="36" height="36" rx="3" fill="currentColor" />
            {/* avião de papel */}
            <path d="M9 21.5 L31 9.5 L24 31 L19.5 23.2 Z" fill="var(--color-bg)" />
            <path d="M19.5 23.2 L31 9.5 L24 31 Z" fill="var(--color-bg)" fillOpacity="0.62" />
            {/* rastro de velocidade */}
            <path d="M6.5 25.5 h5" stroke="var(--color-bg)" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 29.5 h3.5" stroke="var(--color-bg)" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export default function Logo({ size = 30, className = '' }) {
    return (
        <span className={`brand-logo ${className}`}>
            <LogoMark size={size} />
            <span className="brand-word">New <b>Dev</b> Jobs</span>
        </span>
    );
}
