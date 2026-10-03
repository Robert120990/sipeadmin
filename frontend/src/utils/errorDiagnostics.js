/* global __APP_VERSION__ */
/**
 * errorDiagnostics.js
 * Módulo centralizado de diagnóstico y captura de errores para SIPE Admin.
 * Permite capturar el contexto de fallos técnicos (React, API, promesas)
 * y generar un reporte formateado en Markdown para copiar y pegar directamente
 * al asistente o equipo de soporte.
 */

import { getStoredUser } from './auth';

// Buffer circular de errores recientes de red/API y excepciones globales (máx 15)
const MAX_LOGS = 15;
const errorLogBuffer = [];

export const recordDiagnosticLog = (entry) => {
    try {
        const logItem = {
            id: Date.now() + Math.random().toString(36).substr(2, 4),
            timestamp: new Date().toISOString(),
            timeLocal: new Date().toLocaleString(),
            ...entry
        };
        errorLogBuffer.unshift(logItem);
        if (errorLogBuffer.length > MAX_LOGS) {
            errorLogBuffer.pop();
        }
        // Exponer en window para inspección rápida en DevTools si es necesario
        if (typeof window !== 'undefined') {
            window.__SIPEOFI_ERROR_LOGS__ = errorLogBuffer;
        }
    } catch (_) {
        /* ignore */
    }
};

export const recordApiError = ({ method, url, status, message, data, requestId }) => {
    recordDiagnosticLog({
        type: 'API_ERROR',
        method: method || 'GET',
        url: url || '',
        status: status || 0,
        message: typeof message === 'string' ? message : JSON.stringify(message || 'Error de API'),
        data: data ? (typeof data === 'object' ? JSON.stringify(data).slice(0, 300) : String(data).slice(0, 300)) : null,
        requestId: requestId || null
    });
};

export const recordGlobalError = (eventOrError) => {
    const message = eventOrError?.message || eventOrError?.reason?.message || String(eventOrError);
    const stack = eventOrError?.error?.stack || eventOrError?.reason?.stack || '';
    recordDiagnosticLog({
        type: 'UNHANDLED_EXCEPTION',
        message,
        stack: stack ? stack.slice(0, 500) : null
    });
};

export const getRecentErrorLogs = () => [...errorLogBuffer];

/**
 * Extrae y formatea el mensaje de error de una respuesta API, adjuntando el ID de rastreo si está disponible.
 */
export const formatApiErrorMessage = (error, defaultMsg = 'Ocurrió un error inesperado') => {
    const data = error?.response?.data;
    const msg = data?.message || error?.message || defaultMsg;
    const reqId = data?.requestId || error?.requestId || error?.response?.headers?.['x-request-id'];
    return reqId ? `${msg} (ID Rastreo: ${String(reqId).slice(0, 8)})` : msg;
};

/**
 * Genera un reporte formateado en Markdown con todos los parámetros técnicos
 * indispensables para que la IA o desarrollador entienda exactamente qué ocurrió.
 */
export const generateDiagnosticReport = ({ error, errorInfo, tabName, tabPath, extraContext = {} }) => {
    const user = getStoredUser();
    const version = typeof __APP_VERSION__ !== 'undefined' ? `v${__APP_VERSION__}` : 'v1.0.96+';
    const timestampIso = new Date().toISOString();
    const timestampLocal = new Date().toLocaleString();
    const currentUrl = typeof window !== 'undefined' ? window.location.href : 'N/A';
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A';
    const screenRes = typeof window !== 'undefined' 
        ? `${window.screen?.width || 0}x${window.screen?.height || 0} (Viewport: ${window.innerWidth}x${window.innerHeight})` 
        : 'N/A';

    const errorName = error?.name || 'Error';
    const errorMessage = error?.message || (typeof error === 'string' ? error : 'Error no identificado');
    const errorStack = error?.stack || 'No disponible';
    const componentStack = errorInfo?.componentStack || 'No disponible';

    const recentApis = errorLogBuffer
        .filter(l => l.type === 'API_ERROR')
        .slice(0, 5);

    const latestReqId = extraContext?.requestId || error?.requestId || recentApis.find(a => a.requestId)?.requestId || null;

    let md = `### 📋 Reporte de Error - SIPE Admin (${version})\n\n`;
    md += `**Contexto del Sistema:**\n`;
    md += `- **Versión:** \`${version}\`\n`;
    md += `- **Fecha/Hora:** \`${timestampIso}\` (${timestampLocal})\n`;
    md += `- **URL Actual:** \`${currentUrl}\`\n`;
    if (latestReqId) {
        md += `- **ID de Rastreo (Request ID):** \`${latestReqId}\`\n`;
    }
    if (tabName || tabPath) {
        md += `- **Pestaña/Módulo Activo:** \`${tabName || 'N/A'}\` (\`${tabPath || 'N/A'}\`)\n`;
    }
    md += `- **Usuario Autenticado:** \`${user?.username || user?.email || 'No autenticado'}\` (ID: \`${user?.id || 'N/A'}\`, Rol: \`${user?.role_name || user?.role || user?.role_id || 'N/A'}\`)\n`;
    md += `- **Navegador / Plataforma:** \`${userAgent}\`\n`;
    md += `- **Resolución:** \`${screenRes}\`\n\n`;

    if (Object.keys(extraContext).length > 0) {
        md += `**Parámetros Específicos:**\n`;
        md += '```json\n' + JSON.stringify(extraContext, null, 2) + '\n```\n\n';
    }

    md += `**💥 Mensaje del Error:**\n`;
    md += `> **[${errorName}]** ${errorMessage}\n\n`;

    if (componentStack && componentStack !== 'No disponible') {
        md += `**📍 Pila de Componentes React (Component Stack):**\n`;
        md += '```\n' + componentStack.trim() + '\n```\n\n';
    }

    if (errorStack && errorStack !== 'No disponible') {
        md += `**🪵 Traza de Ejecución JavaScript (Stack Trace):**\n`;
        md += '```\n' + errorStack.trim() + '\n```\n\n';
    }

    if (recentApis.length > 0) {
        md += `**🌐 Últimas Peticiones API Fallidas:**\n`;
        recentApis.forEach(api => {
            const reqIdStr = api.requestId ? ` [ID Rastreo: \`${api.requestId}\`]` : '';
            md += `- \`[${api.method}] ${api.url}\` -> Estado: **${api.status}** - ${api.message}${reqIdStr}\n`;
            if (api.data) {
                md += `  Respuesta servidor: \`${api.data}\`\n`;
            }
        });
        md += '\n';
    }

    return md;
};

/**
 * Copia texto al portapapeles con compatibilidad amplia para navegadores modernos y legados.
 */
export const copyDiagnosticToClipboard = async (text) => {
    try {
        if (navigator?.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (_) {
        /* fallback below */
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
    } catch (e) {
        console.error('Error copiando al portapapeles:', e);
        return false;
    }
};
