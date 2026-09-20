import React from 'react';

export default function LoadingFallback({ fullScreen = false, message = 'Cargando módulo...' }) {
    return (
        <div 
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                minHeight: fullScreen ? '100vh' : '280px',
                width: '100%',
                padding: '2rem',
                color: 'var(--text-muted, #94a3b8)'
            }}
        >
            <div 
                style={{
                    width: fullScreen ? 44 : 32,
                    height: fullScreen ? 44 : 32,
                    border: '3px solid rgba(59, 130, 246, 0.15)',
                    borderTopColor: 'var(--primary, #3b82f6)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite'
                }} 
            />
            {message && (
                <span style={{ fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.01em' }}>
                    {message}
                </span>
            )}
            <style>{`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
