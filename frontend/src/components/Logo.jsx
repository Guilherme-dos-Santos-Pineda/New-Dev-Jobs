// Logomark + wordmark autoral do newdevjobs.
// Marca: um avião de papel (envio) saindo de colchetes de código { } com rastro de velocidade.
export function LogoMark({ size = 32 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            {/* Tinta chapada no lugar do degrade, e canto quase reto: a marca
                segue a mesma regra do resto da interface. */}
            <rect x="2" y="2" width="36" height="36" rx="3" fill="#123C55" />
            {/* aviao de papel */}
            <path d="M9 21.5 L31 9.5 L24 31 L19.5 23.2 Z" fill="#F2F3EE" />
            <path d="M19.5 23.2 L31 9.5 L24 31 Z" fill="#8FBDD6" />
            {/* rastro de velocidade */}
            <path d="M6.5 25.5 h5" stroke="#F2F3EE" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 29.5 h3.5" stroke="#F2F3EE" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

export default function Logo({ size = 30, className = '' }) {
    return (
        <span className={`brand-logo ${className}`}>
            <LogoMark size={size} />
            <span className="brand-word">
                new<b>dev</b><span className="brand-word-jobs">jobs</span>
            </span>
        </span>
    );
}
