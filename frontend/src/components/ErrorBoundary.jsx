import React from 'react';
import { AlertTriangle, RefreshCw, LogOut, Copy, Check, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { generateDiagnosticReport, copyDiagnosticToClipboard, getRecentErrorLogs } from '../utils/errorDiagnostics';

export default class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
            copied: false,
            showDetails: false
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary capturó un error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    handleResetError = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
            copied: false,
            showDetails: false
        });
    };

    handleCopyReport = async () => {
        const { error, errorInfo } = this.state;
        const { tabName, tabPath } = this.props;
        const report = generateDiagnosticReport({
            error,
            errorInfo,
            tabName,
            tabPath
        });

        const success = await copyDiagnosticToClipboard(report);
        if (success) {
            this.setState({ copied: true });
            setTimeout(() => {
                this.setState({ copied: false });
            }, 3500);
        }
    };

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
            const { error, errorInfo, copied, showDetails } = this.state;
            const { tabName, tabPath, isTabLevel } = this.props;

            const isChunkError =
                error?.message?.includes('dynamically imported module') ||
                error?.message?.includes('Loading chunk') ||
                error?.message?.includes('Failed to fetch');

            const recentApis = getRecentErrorLogs().filter((l) => l.type === 'API_ERROR');
            const reqId = error?.requestId || recentApis.find((a) => a.requestId)?.requestId || null;

            const report = generateDiagnosticReport({
                error,
                errorInfo,
                tabName,
                tabPath,
                extraContext: reqId ? { requestId: reqId } : {}
            });

            return (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        minHeight: isTabLevel ? '450px' : '100vh',
                        padding: '1.25rem',
                        backgroundColor: isTabLevel ? 'transparent' : 'var(--bg, #0f172a)',
                        color: 'var(--text, #f8fafc)',
                        fontFamily: "'Inter', sans-serif"
                    }}
                >
                    <div
                        className="card glass"
                        style={{
                            maxWidth: '720px',
                            width: '100%',
                            textAlign: 'left',
                            padding: '1.75rem',
                            borderRadius: '12px',
                            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                            border: '1px solid var(--border, #334155)'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginBottom: '1rem' }}>
                            <div
                                style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '50%',
                                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0
                                }}
                            >
                                <AlertTriangle size={26} color="var(--danger, #ef4444)" />
                            </div>
                            <div>
                                <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: 'var(--text)' }}>
                                    {isChunkError
                                        ? 'Nueva versión disponible'
                                        : isTabLevel
                                        ? `Error en la pestaña ${tabName || 'actual'}`
                                        : 'Algo no salió como se esperaba'}
                                </h2>
                                <p style={{ margin: '3px 0 0 0', color: 'var(--text-secondary, #94a3b8)', fontSize: '0.825rem' }}>
                                    {isChunkError
                                        ? 'Se detectó una actualización del sistema. Por favor recarga para obtener la última versión.'
                                        : 'Ocurrió una excepción al procesar la vista. Puedes copiar el diagnóstico técnico para soporte.'}
                                </p>
                            </div>
                        </div>

                        {/* Error Message Box */}
                        {!isChunkError && error && (
                            <div
                                style={{
                                    padding: '0.65rem 0.85rem',
                                    borderRadius: '6px',
                                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    marginBottom: '1rem',
                                    fontSize: '0.825rem',
                                    fontFamily: 'monospace',
                                    color: '#ef4444',
                                    wordBreak: 'break-word',
                                    lineHeight: 1.4,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '0.35rem'
                                }}
                            >
                                <div>
                                    <strong>[{error.name || 'Error'}]:</strong> {error.message || 'Error desconocido'}
                                </div>
                                {reqId && (
                                    <div style={{ fontSize: '0.75rem', color: '#60a5fa' }}>
                                        <span style={{ fontWeight: 600 }}>ID de Rastreo (Request ID):</span> <code>{reqId}</code>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem', marginBottom: '1rem' }}>
                            {!isChunkError && (
                                <button
                                    type="button"
                                    onClick={this.handleCopyReport}
                                    className="btn-primary"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        padding: '0.55rem 1rem',
                                        fontSize: '0.825rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        borderRadius: '6px',
                                        backgroundColor: copied ? '#10B981' : undefined
                                    }}
                                    title="Copia los parámetros y contexto técnico para pegarlo en el chat"
                                >
                                    {copied ? <Check size={16} /> : <Copy size={16} />}
                                    <span>{copied ? '¡Diagnóstico copiado al portapapeles!' : 'Copiar diagnóstico para soporte / IA'}</span>
                                </button>
                            )}

                            {isTabLevel && (
                                <button
                                    type="button"
                                    onClick={this.handleResetError}
                                    className="btn-secondary"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        padding: '0.55rem 0.9rem',
                                        fontSize: '0.825rem',
                                        cursor: 'pointer',
                                        borderRadius: '6px'
                                    }}
                                >
                                    <RotateCcw size={15} />
                                    <span>Reintentar pestaña</span>
                                </button>
                            )}

                            <button
                                type="button"
                                onClick={this.handleReload}
                                className={isChunkError ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.45rem',
                                    padding: '0.55rem 0.9rem',
                                    fontSize: '0.825rem',
                                    cursor: 'pointer',
                                    borderRadius: '6px'
                                }}
                            >
                                <RefreshCw size={15} />
                                <span>Recargar sistema</span>
                            </button>

                            {!isTabLevel && (
                                <button
                                    type="button"
                                    onClick={this.handleGoLogin}
                                    className="btn-secondary"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.45rem',
                                        padding: '0.55rem 0.9rem',
                                        fontSize: '0.825rem',
                                        cursor: 'pointer',
                                        borderRadius: '6px'
                                    }}
                                >
                                    <LogOut size={15} />
                                    <span>Ir al login</span>
                                </button>
                            )}
                        </div>

                        {/* Collapsible Details & Parameters */}
                        {!isChunkError && (
                            <div style={{ borderTop: '1px solid var(--border, #334155)', paddingTop: '0.75rem' }}>
                                <button
                                    type="button"
                                    onClick={() => this.setState({ showDetails: !showDetails })}
                                    style={{
                                        background: 'transparent',
                                        border: 'none',
                                        color: 'var(--text-secondary, #94a3b8)',
                                        fontSize: '0.78rem',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.4rem',
                                        padding: 0
                                    }}
                                >
                                    {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    <span>{showDetails ? 'Ocultar parámetros técnicos y traza' : 'Ver parámetros técnicos y traza del error'}</span>
                                </button>

                                {showDetails && (
                                    <div style={{ marginTop: '0.75rem' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                                            Puedes seleccionar y copiar directamente este reporte si tu navegador restringe el portapapeles:
                                        </div>
                                        <pre
                                            style={{
                                                padding: '0.75rem',
                                                borderRadius: '6px',
                                                background: 'var(--bg, #0f172a)',
                                                border: '1px solid var(--border, #334155)',
                                                fontSize: '0.72rem',
                                                lineHeight: 1.45,
                                                maxHeight: '260px',
                                                overflowY: 'auto',
                                                whiteSpace: 'pre-wrap',
                                                wordBreak: 'break-word',
                                                color: 'var(--text)'
                                            }}
                                        >
                                            {report}
                                        </pre>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
