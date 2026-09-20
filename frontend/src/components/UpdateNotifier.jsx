import React, { useEffect, useRef, useState, useCallback } from 'react';
import { RefreshCw, AlertTriangle, Sparkles, X } from 'lucide-react';

const CHECK_INTERVAL_MS = 3 * 60 * 1000; // Cada 3 minutos
const SESSION_UPDATING_KEY = 'sipeadmin_updating_to';
const SESSION_MINIMIZED_KEY = 'sipeadmin_update_minimized';

/**
 * UpdateNotifier
 * Detecta nuevas versiones comparando la versión local (inyectada por Vite)
 * con /version.json (o por nuevo Service Worker en espera).
 * En entorno de desarrollo (npm run dev / Vite HMR), permanece inactivo.
 * En producción, muestra una alerta no invasiva advirtiendo al usuario
 * que guarde sus cambios pendientes antes de proceder a actualizar.
 */
export default function UpdateNotifier() {
    const isDev = Boolean(import.meta.env.DEV);

    const [updateInfo, setUpdateInfo] = useState({
        available: false,
        newVersion: '',
        currentVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
        buildId: ''
    });
    const [isMinimized, setIsMinimized] = useState(() => {
        try {
            return sessionStorage.getItem(SESSION_MINIMIZED_KEY) === '1';
        } catch {
            return false;
        }
    });
    const [isUpdating, setIsUpdating] = useState(false);
    const busyRef = useRef(false);

    const checkVersion = useCallback(async () => {
        if (isDev || busyRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
        busyRef.current = true;
        try {
            const res = await fetch(`/version.json?t=${Date.now()}`, {
                cache: 'no-store',
                headers: { 'Cache-Control': 'no-cache' }
            });
            if (!res.ok) return;

            const remote = await res.json();
            const local = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
            if (!local || !remote?.version) return;

            // Si ya estamos en la misma versión que el servidor, limpiar flags de actualización
            if (remote.version === local) {
                try {
                    sessionStorage.removeItem(SESSION_UPDATING_KEY);
                    sessionStorage.removeItem(SESSION_MINIMIZED_KEY);
                } catch {
                    // ignorar
                }
                setUpdateInfo(prev => prev.available ? { ...prev, available: false } : prev);
                return;
            }

            // Si el usuario ya pulsó "Actualizar ahora" para esta versión específica en esta sesión,
            // evitar re-mostrar la alerta si el navegador aún tiene recursos en caché
            try {
                if (sessionStorage.getItem(SESSION_UPDATING_KEY) === remote.version) {
                    return;
                }
            } catch {
                // ignorar
            }

            // Detecta si la versión del servidor es diferente a la instalada actualmente
            setUpdateInfo({
                available: true,
                newVersion: remote.version,
                currentVersion: local,
                buildId: remote.buildId || ''
            });
        } catch {
            // Silencioso ante fallas transitorias de red
        } finally {
            busyRef.current = false;
        }
    }, [isDev]);

    useEffect(() => {
        if (isDev) return;

        // Escucha si un nuevo Service Worker entra en estado 'waiting'
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistration().then(reg => {
                if (!reg) return;

                if (reg.waiting) {
                    checkVersion();
                }

                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                checkVersion();
                            }
                        });
                    }
                });
            }).catch(() => {});
        }

        const onVisibility = () => {
            if (document.visibilityState === 'visible') {
                checkVersion();
            }
        };

        const onFocus = () => {
            checkVersion();
        };

        const initialTimer = setTimeout(checkVersion, 3000);
        const interval = setInterval(checkVersion, CHECK_INTERVAL_MS);

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('focus', onFocus);
        window.addEventListener('online', checkVersion);

        return () => {
            clearTimeout(initialTimer);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('online', checkVersion);
        };
    }, [isDev, checkVersion]);

    const handleMinimize = () => {
        setIsMinimized(true);
        try {
            sessionStorage.setItem(SESSION_MINIMIZED_KEY, '1');
        } catch {
            // ignorar
        }
    };

    const handleApplyUpdate = async () => {
        setIsUpdating(true);
        try {
            if (updateInfo.newVersion) {
                sessionStorage.setItem(SESSION_UPDATING_KEY, updateInfo.newVersion);
            }
            if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                const reg = await navigator.serviceWorker.getRegistration();
                if (reg?.waiting) {
                    reg.waiting.postMessage('SKIP_WAITING');
                }
            }
        } catch (err) {
            console.warn('Error al activar nuevo Service Worker:', err);
        }

        // Breve pausa para que el usuario aprecie la retroalimentación visual antes de la recarga
        setTimeout(() => {
            window.location.reload();
        }, 350);
    };

    if (isDev || !updateInfo.available) return null;

    // Estado minimizado: Píldora flotante accesible y no invasiva
    if (isMinimized) {
        return (
            <button
                type="button"
                className="update-minimized-pill"
                onClick={() => setIsMinimized(false)}
                title="Haga clic para ver los detalles de la actualización"
            >
                <span className="update-pulse-dot" />
                <RefreshCw size={15} style={{ color: '#10b981' }} />
                <span>Actualización v{updateInfo.newVersion} disponible</span>
            </button>
        );
    }

    // Estado expandido: Alerta completa con advertencia de guardado
    return (
        <div className="update-alert-container">
            <div className="update-alert-card" role="alert" aria-live="polite">
                <div className="update-alert-header">
                    <div className="update-alert-title-wrap">
                        <div className="update-alert-icon">
                            <Sparkles size={18} />
                        </div>
                        <h4 className="update-alert-title">
                            ¡Nueva versión disponible!
                            <span className="update-version-badge">v{updateInfo.newVersion}</span>
                        </h4>
                    </div>
                    <button
                        type="button"
                        className="update-alert-close"
                        onClick={handleMinimize}
                        title="Minimizar notificación"
                        aria-label="Minimizar notificación"
                    >
                        <X size={17} />
                    </button>
                </div>

                <div className="update-alert-body">
                    <p style={{ margin: 0 }}>
                        Hay una nueva actualización del sistema lista para instalarse.
                    </p>

                    <div className="update-alert-warning">
                        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                        <p>
                            <strong>Atención:</strong> Si tiene información o formularios sin guardar en pantalla,
                            por favor <strong>guárdelos antes de actualizar</strong> para evitar perder sus cambios.
                        </p>
                    </div>
                </div>

                <div className="update-alert-actions">
                    <button
                        type="button"
                        className="update-btn-secondary"
                        onClick={handleMinimize}
                        disabled={isUpdating}
                    >
                        Recordar más tarde
                    </button>
                    <button
                        type="button"
                        className="update-btn-primary"
                        onClick={handleApplyUpdate}
                        disabled={isUpdating}
                    >
                        <RefreshCw size={14} className={isUpdating ? 'spin' : ''} />
                        {isUpdating ? 'Actualizando...' : 'Actualizar ahora'}
                    </button>
                </div>
            </div>
        </div>
    );
}
