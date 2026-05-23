import React, { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext();

export const useConfirm = () => useContext(ConfirmContext);

export const ConfirmProvider = ({ children }) => {
    const [state, setState] = useState({ show: false, message: '', resolve: null });
    const [options, setOptions] = useState({});

    const confirm = useCallback((message, opts = {}) => {
        return new Promise(resolve => {
            setOptions({
                title: opts.title || 'Confirmar',
                confirmText: opts.confirmText || 'Confirmar',
                cancelText: opts.cancelText || 'Cancelar',
                variant: opts.variant || 'primary'
            });
            setState({ show: true, message, resolve });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        state.resolve(true);
        setState({ show: false, message: '', resolve: null });
    }, [state]);

    const handleCancel = useCallback(() => {
        state.resolve(false);
        setState({ show: false, message: '', resolve: null });
    }, [state]);

    const btnStyle = options.variant === 'danger'
        ? { background: 'var(--danger)', color: '#fff', border: 'none', padding: '0.6rem 1.5rem', borderRadius: 'var(--border-radius)', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }
        : {};

    return (
        <ConfirmContext.Provider value={{ confirm }}>
            {children}
            {state.show && (
                <div className="modal-overlay" onClick={handleCancel}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ width: '420px', padding: '2rem', borderRadius: '12px' }}>
                        <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.15rem' }}>{options.title}</h3>
                        <p style={{ color: 'var(--text-muted)', margin: '0 0 1.5rem 0', lineHeight: 1.5, whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>
                            {state.message}
                        </p>
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                            <button onClick={handleCancel} className="btn-secondary" style={{ padding: '0.6rem 1.5rem', fontSize: '0.85rem' }}>
                                {options.cancelText}
                            </button>
                            <button
                                onClick={handleConfirm}
                                className={options.variant === 'danger' ? '' : 'btn-primary'}
                                style={options.variant === 'danger' ? btnStyle : { padding: '0.6rem 1.5rem', fontSize: '0.85rem' }}
                            >
                                {options.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmContext.Provider>
    );
};
