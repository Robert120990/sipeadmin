import React from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary capturó un error:', error, errorInfo);
    }

    handleReload = async () => {
        try {
            // Limpiar cachés del Service Worker si hay scripts obsoletos
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                for (const reg of regs) {
                    await reg.unregister();
                }
            }
            sessionStorage.clear();
        } catch (e) {
            console.warn('Error limpiando cachés en recuperación:', e);
        }
        window.location.reload();
    };

    handleGoLogin = () => {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            sessionStorage.clear();
        } catch (_) {
            /* ignore */
        }
        window.location.href = '/login';
    };

    render() {
        if (this.state.hasError) {
            const isChunkError =
                this.state.error?.message?.includes('dynamically imported module') ||
                this.state.error?.message?.includes('Loading chunk') ||
                this.state.error?.message?.includes('Failed to fetch');

            return (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: '100vh',
                        padding: '1.5rem',
                        backgroundColor: 'var(--bg, #0f172a)',
                        color: 'var(--text, #f8fafc)',
                        fontFamily: "'Inter', sans-serif"
                    }}
                >
                    <div
                        className="card glass"
                        style={{
                            maxWidth: '480px',
                            width: '100%',
                            textAlign: 'center',
                            padding: '2.5rem 2rem',
                            borderRadius: '12px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                            border: '1px solid var(--border, #334155)'
                        }}
                    >
                        <div
                            style={{
                                width: '56px',
                                height: '56px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: '1.25rem'
                            }}
                        >
                            <AlertTriangle size={32} color="var(--danger, #ef4444)" />
                        </div>

                        <h2 style={{ margin: '0 0 0.5rem 0', fontSize: '1.4rem', fontWeight: 600 }}>
                            {isChunkError ? 'Nueva versión disponible' : 'Algo no salió como se esperaba'}
                        </h2>

                        <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.92rem', marginBottom: '1.75rem', lineHeight: 1.5 }}>
                            {isChunkError
                                ? 'Se detectó una actualización reciente del sistema. Por favor recarga la página para obtener la versión más reciente.'
                                : 'Ocurrió un problema temporal al cargar los componentes de la vista.'}
                        </p>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                onClick={this.handleReload}
                                className="btn-primary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                <RefreshCw size={16} />
                                Recargar y actualizar sistema
                            </button>

                            <button
                                onClick={this.handleGoLogin}
                                className="btn-secondary"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '0.5rem',
                                    padding: '0.75rem 1rem',
                                    fontWeight: 500,
                                    cursor: 'pointer'
                                }}
                            >
                                <LogOut size={16} />
                                Ir al inicio de sesión
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
