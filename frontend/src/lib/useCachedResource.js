import { useCallback, useEffect, useState } from 'react';

// Cache em memória (por aba/sessão) com stale-while-revalidate.
// Evita refetch ao alternar entre abas que mudam pouco.
const cache = new Map(); // key -> data

export function invalidateCache(key) {
    if (key) cache.delete(key); else cache.clear();
}

/**
 * useCachedResource(key, fetcher)
 * - Mostra dado cacheado na hora (sem spinner) e revalida em segundo plano.
 * - refresh() força recarga.
 */
export function useCachedResource(key, fetcher, { enabled = true } = {}) {
    const [data, setData] = useState(() => cache.get(key));
    const [loading, setLoading] = useState(() => !cache.has(key));
    const [error, setError] = useState(null);

    const load = useCallback(async (silent) => {
        if (!silent) setLoading(true);
        try {
            const res = await fetcher();
            cache.set(key, res);
            setData(res);
            setError(null);
        } catch (e) {
            setError(e);
        } finally {
            setLoading(false);
        }
        // fetcher é assumido estável por key (não entra nas deps de propósito)
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!enabled) return;
        const cached = cache.has(key);
        setData(cache.get(key));
        setLoading(!cached);
        load(cached); // se já tinha cache, revalida em silêncio
    }, [key, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

    return { data, loading, error, refresh: () => load(false), setData };
}
