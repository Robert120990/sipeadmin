import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 60 min
const UPDATE_RELOAD_FLAG = 'sipeadmin-updated';

// Detecta nuevas versiones comparando la version local (inyectada por Vite)
// con dist/version.json (network-first, nunca cacheado). Al detectar una
// versión distinta: activa el nuevo Service Worker, muestra el banner y
// recarga la app una sola vez (flag en sessionStorage evita bucles).
export default function UpdateNotifier() {
    const [updating, setUpdating] = useState(false);
    const busyRef = useRef(false);

    useEffect(() => {
        const check = async () => {
            if (busyRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
            busyRef.current = true;
            try {
                const res = await fetch('/version.json', { cache: 'no-store' });
                if (!res.ok) return;
                const remote = await res.json();
                const local = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null;
                if (!local || !remote.version) return;

                if (remote.version === local) {
                    // Versiones iguales: auto-recuperación del flag anti-bucle
                    sessionStorage.removeItem(UPDATE_RELOAD_FLAG);
                    return;
                }

                if (sessionStorage.getItem(UPDATE_RELOAD_FLAG) === '1') return;

                sessionStorage.setItem(UPDATE_RELOAD_FLAG, '1');
                setUpdating(true);

                try {
                    const reg = await navigator.serviceWorker?.getRegistration();
                    reg?.waiting?.postMessage('SKIP_WAITING');
                } catch (e) { /* sin service worker: la recarga igual obtiene el index.html nuevo */ }

                setTimeout(() => window.location.reload(), 1200);
            } catch (e) { /* sin conexión: ignorar */ }
            finally {
                busyRef.current = false;
            }
        };

        const onVisibility = () => {
            if (document.visibilityState === 'visible') check();
        };

        const firstTimer = setTimeout(check, 4000);
        const interval = setInterval(check, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            clearTimeout(firstTimer);
            clearInterval(interval);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, []);

    if (!updating) return null;

    return (
        <div className="update-banner">
            <RefreshCw size={16} className="spin" />
            Nueva versión disponible. Actualizando...
        </div>
    );
}
