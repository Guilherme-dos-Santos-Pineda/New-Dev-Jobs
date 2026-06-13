// Mini gráfico (sparkline) em SVG, sem dependências.
export default function Sparkline({ data = [], color = 'var(--color-accent)', height = 34 }) {
    if (!data || data.length < 2) return null;
    const w = 100, h = height;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const step = w / (data.length - 1);
    const pts = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2]);
    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L${w.toFixed(1)},${h} L0,${h} Z`;
    const id = 'sg' + Math.random().toString(36).slice(2, 7);
    return (
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
            <defs>
                <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={color} stopOpacity="0" />
                </linearGradient>
            </defs>
            <path d={area} fill={`url(#${id})`} />
            <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"
                strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}
