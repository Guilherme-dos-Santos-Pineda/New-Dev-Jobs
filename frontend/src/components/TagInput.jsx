import { useState } from 'react';

// Campo de tags reutilizável (skills, keywords, palavras/domínios bloqueados).
export default function TagInput({ value = [], onChange, placeholder, suggestions = [], tone = 'accent', normalize }) {
    const [input, setInput] = useState('');

    function add(raw) {
        let v = (raw ?? input).trim().replace(/,$/, '');
        if (normalize) v = normalize(v);
        if (!v) return;
        if (!value.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...value, v]);
        setInput('');
    }
    function remove(tag) {
        onChange(value.filter((x) => x !== tag));
    }

    const chipClass = tone === 'danger' ? 'chip danger-chip' : 'chip';
    const remaining = suggestions.filter((s) => !value.some((x) => x.toLowerCase() === s.toLowerCase()));

    return (
        <div>
            <input
                className="input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(); }
                    else if (e.key === 'Backspace' && !input && value.length) remove(value[value.length - 1]);
                }}
                onBlur={() => input && add()}
                placeholder={placeholder}
            />
            {value.length > 0 && (
                <div className="chips" style={{ marginTop: 10 }}>
                    {value.map((tag) => (
                        <span key={tag} className={chipClass}>
                            {tag}
                            <button type="button" onClick={() => remove(tag)} aria-label={`Remover ${tag}`}><i className="ti ti-x" /></button>
                        </span>
                    ))}
                </div>
            )}
            {remaining.length > 0 && (
                <div className="chips" style={{ marginTop: 10 }}>
                    {remaining.map((s) => (
                        <span key={s} className="chip muted" style={{ cursor: 'pointer' }} onClick={() => add(s)}>
                            <i className="ti ti-plus" style={{ fontSize: 12 }} />{s}
                        </span>
                    ))}
                </div>
            )}
        </div>
    );
}
