import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext();

export const useToast = () => useContext(ToastContext);

export const ToastProvider = ({ children }) => {
    const [toasts, setToasts] = useState([]);

    const addToast = useCallback((message, type = 'info') => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 5000);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast }}>
            {children}
            <div style={{ position: 'fixed', bottom: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '8px', zIndex: 9999 }}>
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
                            borderRadius: 'var(--border-radius)',
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                            borderLeft: `4px solid ${
                                toast.type === 'success' ? 'var(--success)' : 
                                toast.type === 'error' ? 'var(--danger)' : 
                                'var(--primary)'
                            }`
                        }}
                    >
                        {toast.type === 'success' && <CheckCircle size={18} color="var(--success)" />}
                        {toast.type === 'error' && <AlertCircle size={18} color="var(--danger)" />}
                        {toast.type === 'info' && <Info size={18} color="var(--primary)" />}
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
