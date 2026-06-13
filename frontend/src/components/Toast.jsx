import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
    const [toast, setToast] = useState(null);

    const show = useCallback((message, type = 'info') => {
        setToast({ message, type });
    }, []);

    useEffect(() => {
        if (!toast) return;
        const t = setTimeout(() => setToast(null), 3200);
        return () => clearTimeout(t);
    }, [toast]);

    return (
        <ToastCtx.Provider value={{ show }}>
            {children}
            {toast && (
                <div className={`toast ${toast.type === 'error' ? 'error' : ''}`}>
                    <i className={`ti ${toast.type === 'error' ? 'ti-alert-circle' : 'ti-circle-check'}`} />
                    {toast.message}
                </div>
            )}
        </ToastCtx.Provider>
    );
}

export function useToast() {
    return useContext(ToastCtx);
}
