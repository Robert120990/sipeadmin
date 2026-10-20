/**
 * Colector pasivo de diagnóstico en tiempo real para Tickets de Soporte (admin.sipesv.com).
 * Registra los últimos errores de consola, excepciones JS y respuestas HTTP >= 400
 * y los combina con el búfer de `errorDiagnostics.js` para determinar relevancia.
 */
import { getRecentErrorLogs } from './errorDiagnostics';

const MAX_ENTRIES = 25;

const state = {
    initialized: false,
    consoleErrors: [],
    runtimeErrors: [],
    networkErrors: []
};

const safeStringify = (val, maxLen = 400) => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'string') return val.slice(0, maxLen);
    if (val instanceof Error) return `${val.name}: ${val.message}`.slice(0, maxLen);
    try {
        return JSON.stringify(val).slice(0, maxLen);
    } catch {
        return String(val).slice(0, maxLen);
    }
};

const pushBounded = (arr, item) => {
    arr.push(item);
    if (arr.length > MAX_ENTRIES) arr.shift();
};

export const initTicketDiagnosticsCollector = () => {
    if (state.initialized || typeof window === 'undefined') return;
    state.initialized = true;

    const origError = console.error;
    console.error = (...args) => {
        try {
            const msg = args.map((a) => safeStringify(a, 300)).join(' ');
            if (msg && !msg.includes('React Router Future Flag')) {
                pushBounded(state.consoleErrors, {
                    ts: new Date().toISOString(),
                    route: window.location?.pathname || '/',
                    message: msg.slice(0, 500)
                });
            }
        } catch {
            // ignore
        }
        origError.apply(console, args);
    };

    window.addEventListener('error', (event) => {
        pushBounded(state.runtimeErrors, {
            ts: new Date().toISOString(),
            type: 'window.onerror',
            route: window.location?.pathname || '/',
            message: String(event?.message || 'Runtime Error').slice(0, 400),
            source: event?.filename ? `${event.filename.split('/').pop()}:${event.lineno || 0}` : null
        });
    });

    window.addEventListener('unhandledrejection', (event) => {
        const reason = event?.reason;
        if (reason?.isAxiosError || reason?.config?.url) return;
        pushBounded(state.runtimeErrors, {
            ts: new Date().toISOString(),
            type: 'unhandledrejection',
            route: window.location?.pathname || '/',
            message: safeStringify(reason?.message || reason, 400)
        });
    });
};

export const recordNetworkErrorForTicket = (error) => {
    try {
        const status = error?.response?.status || 0;
        const url = error?.config?.url || '';
        if (!url || status === 401) return;
        const method = String(error?.config?.method || 'GET').toUpperCase();
        const serverMsg =
            error?.response?.data?.message ||
            error?.response?.data?.error ||
            error?.message ||
            'Error de red';

        pushBounded(state.networkErrors, {
            ts: new Date().toISOString(),
            route: typeof window !== 'undefined' ? window.location?.pathname || '/' : '/',
            method,
            url: String(url).slice(0, 220),
            status,
            message: String(serverMsg).slice(0, 350)
        });
    } catch {
        // ignore
    }
};

export const collectTicketDiagnosticsSnapshot = ({ subject = '', description = '', currentRoute = '' } = {}) => {
    const now = Date.now();
    const route = currentRoute || (typeof window !== 'undefined' ? window.location?.pathname : '/');
    const text = `${subject} ${description}`.toLowerCase();

    // Integrar también errores capturados por errorDiagnostics.js de SIPE Admin
    const globalLogs = getRecentErrorLogs() || [];
    const extraNetwork = globalLogs
        .filter((l) => l.type === 'API_ERROR' || l.type === 'NETWORK_ERROR')
        .map((l) => ({
            ts: l.timestamp,
            route: l.page || route,
            method: l.method || 'GET',
            url: l.url || '/api',
            status: l.status || 500,
            message: l.message || 'Error en petición API'
        }));
    const extraRuntime = globalLogs
        .filter((l) => l.type !== 'API_ERROR' && l.type !== 'NETWORK_ERROR')
        .map((l) => ({
            ts: l.timestamp,
            type: l.type || 'RUNTIME_ERROR',
            route: l.page || route,
            message: l.message || 'Error en aplicación'
        }));

    const netErrors = [...state.networkErrors, ...extraNetwork].slice(-12);
    const rtErrors = [...state.runtimeErrors, ...extraRuntime].slice(-8);
    const conErrors = state.consoleErrors.slice(-10);

    let relevanceScore = 0;
    const matchedReasons = [];

    const recentNetOnRoute = netErrors.filter((e) => {
        const ageSec = (now - new Date(e.ts).getTime()) / 1000;
        return ageSec <= 300 && (e.route === route || route.includes(e.route));
    });

    if (recentNetOnRoute.length > 0) {
        const has500 = recentNetOnRoute.some((e) => Number(e.status) >= 500);
        relevanceScore += has500 ? 65 : 45;
        matchedReasons.push(
            `${recentNetOnRoute.length} fallo(s) HTTP reciente(s) en esta pantalla (${recentNetOnRoute.map((e) => `${e.method} ${e.url} [${e.status || 'ERR'}]`).join(', ')})`
        );
    } else if (netErrors.length > 0) {
        relevanceScore += 20;
        matchedReasons.push(`${netErrors.length} fallo(s) HTTP registrado(s) en la sesión`);
    }

    const recentRtOnRoute = rtErrors.filter((e) => (now - new Date(e.ts).getTime()) / 1000 <= 300);
    if (recentRtOnRoute.length > 0) {
        relevanceScore += 45;
        matchedReasons.push(`${recentRtOnRoute.length} excepción(es) JS reciente(s) en navegador`);
    }

    if (conErrors.length > 0) {
        relevanceScore += 15;
    }

    if (text.trim().length > 3) {
        const allMessages = [
            ...netErrors.map((e) => `${e.url} ${e.message}`),
            ...rtErrors.map((e) => e.message),
            ...conErrors.map((e) => e.message)
        ].join(' ').toLowerCase();

        const words = text.split(/\s+/).filter((w) => w.length >= 4);
        const matchedWords = words.filter((w) => allMessages.includes(w));
        if (matchedWords.length > 0) {
            relevanceScore += 25;
            matchedReasons.push(`Coincidencia directa con términos reportados (${matchedWords.slice(0, 3).join(', ')})`);
        }
    }

    relevanceScore = Math.min(100, relevanceScore);
    const relevance =
        relevanceScore >= 60 ? 'alta' :
        relevanceScore >= 30 ? 'media' :
        (netErrors.length || rtErrors.length || conErrors.length) ? 'baja' : 'sin_errores';

    return {
        capturedAt: new Date().toISOString(),
        currentRoute: route,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        viewport: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
        relevance,
        relevanceScore,
        summary: matchedReasons.length > 0
            ? matchedReasons.join(' · ')
            : 'Sin errores críticos recientes en consola o red en esta vista.',
        networkErrors: netErrors,
        runtimeErrors: rtErrors,
        consoleErrors: conErrors
    };
};
