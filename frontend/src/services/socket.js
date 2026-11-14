import { io } from 'socket.io-client';

const getToken = () => {
    if (typeof window === 'undefined') return null;
    try {
        return localStorage.getItem('token');
    } catch {
        return null;
    }
};

// Conecta al mismo origen (el proxy de Vite reenvía /socket.io en dev;
// en producción el backend Express corre en el mismo dominio).
// Solo inicia conexión automática cuando existe un token JWT válido en sesión.
export const socket = io({
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    autoConnect: Boolean(getToken()),
    reconnection: true,
    auth: (cb) => {
        cb({ token: getToken() });
    }
});

export const syncSocketSession = () => {
    const token = getToken();
    if (token) {
        if (!socket.connected) {
            socket.connect();
        }
    } else if (socket.connected) {
        socket.disconnect();
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('sipe:auth-changed', syncSocketSession);
    window.addEventListener('storage', (ev) => {
        if (ev.key === 'token') syncSocketSession();
    });
}

socket.on('connect_error', (err) => {
    if (err?.message && !String(err.message).includes('Autenticación requerida')) {
        console.warn('[Socket.io] Aviso de conexión:', err.message);
    }
});

export default socket;
