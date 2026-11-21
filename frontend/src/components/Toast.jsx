import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, [removeToast]);

    const getToastAccent = (type) => {
        if (type === 'success') return 'var(--success)';
        if (type === 'error') return 'var(--danger)';
        if (type === 'warning') return '#f59e0b';
        return 'var(--primary)';
    };

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div style={{ position: 'fixed', bottom: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 10050 }}>
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className="glass"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px 16px',
                            minWidth: '280px',
                            maxWidth: '420px',
                            borderRadius: 'var(--border-radius)',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.25)',
                            borderLeft: `4px solid ${getToastAccent(toast.type)}`
                        }}
                    >
                        {toast.type === 'success' && <CheckCircle size={18} color="var(--success)" style={{ flexShrink: 0 }} />}
                        {toast.type === 'error' && <AlertCircle size={18} color="var(--danger)" style={{ flexShrink: 0 }} />}
                        {toast.type === 'warning' && <AlertTriangle size={18} color="#f59e0b" style={{ flexShrink: 0 }} />}
                        {toast.type !== 'success' && toast.type !== 'error' && toast.type !== 'warning' && <Info size={18} color="var(--primary)" style={{ flexShrink: 0 }} />}
                        <span style={{ flex: 1, fontSize: '0.875rem' }}>{toast.message}</span>
                        <button onClick={() => removeToast(toast.id)} style={{ background: 'none', padding: 0, color: 'var(--text-muted)' }}>
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
