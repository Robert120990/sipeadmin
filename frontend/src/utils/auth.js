/**
 * Utilidades seguras de autenticación y sesión local.
 * Evita excepciones de render o pantallas en blanco por valores corruptos en localStorage.
 */

export const getStoredUser = () => {
    try {
        const item = localStorage.getItem('user');
        if (!item || item === 'undefined' || item === 'null') return {};
        const parsed = JSON.parse(item);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch (e) {
        console.warn('Error leyendo usuario en localStorage, restableciendo:', e);
        try {
            localStorage.removeItem('user');
        } catch (_) {
            /* ignore */
        }
        return {};
    }
};

export const getStoredToken = () => {
    try {
        const token = localStorage.getItem('token');
        return token && token !== 'undefined' && token !== 'null' ? token : null;
    } catch (e) {
        return null;
    }
};

export const clearSession = () => {
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    } catch (_) {
        /* ignore */
    }
};
