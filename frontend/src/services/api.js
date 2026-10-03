import axios from 'axios';
import { recordApiError } from '../utils/errorDiagnostics';

const api = axios.create({
    baseURL: '/api'
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

let isRedirecting = false;

api.interceptors.response.use(
    (response) => response,
    (error) => {
        // Registrar en buffer de diagnóstico para contexto de depuración
        recordApiError({
            method: error.config?.method?.toUpperCase() || 'GET',
            url: error.config?.url || '',
            status: error.response?.status || 0,
            message: error.response?.data?.message || error.message || 'Error de API',
            data: error.response?.data
        });

        // 401: Sesión expirada o no autenticado
        if (error.response?.status === 401) {
            const isLoginRequest = error.config?.url?.includes('/login');
            if (!isLoginRequest && !isRedirecting && !window.location.pathname.startsWith('/login')) {
                isRedirecting = true;
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                window.location.href = '/login?expired=1';
            }
        }
        // 403 es permiso denegado en una acción específica (no expulsa al usuario)
        return Promise.reject(error);
    }
);

export default api;
