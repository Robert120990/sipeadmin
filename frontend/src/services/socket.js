import { io } from 'socket.io-client';

// En desarrollo apunta al backend en el puerto 5001
// En producción se ajustará según la configuración de entorno
const URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export const socket = io(URL, {
    autoConnect: true,
    reconnection: true
});
