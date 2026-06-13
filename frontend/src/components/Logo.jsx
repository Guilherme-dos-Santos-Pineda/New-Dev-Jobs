// Logomark + wordmark autoral do newdevjobs.
// Marca: um avião de papel (envio) saindo de colchetes de código { } com rastro de velocidade.
export function LogoMark({ size = 32 }) {
    const id = 'ndj-grad';
    return (
        <svg width={size} height={size} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
                <linearGradient id={id} x1="4" y1="4" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#2B8AF0" />
                    <stop offset="1" stopColor="#0B3F75" />
                </linearGradient>
            </defs>
            {/* squircle base */}
            <rect x="2" y="2" width="36" height="36" rx="12" fill={`url(#${id})`} />
            {/* avião de papel */}
            <path d="M9 21.5 L31 9.5 L24 31 L19.5 23.2 Z" fill="#fff" />
            <path d="M19.5 23.2 L31 9.5 L24 31 Z" fill="#BBD9FF" />
            {/* rastro de velocidade */}
            <path d="M6.5 25.5 h5" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M8 29.5 h3.5" stroke="#fff" strokeOpacity="0.45" strokeWidth="1.8" strokeLinecap="round" />
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
