import { io } from 'socket.io-client';

// Conecta al mismo origen (el proxy de Vite reenvía /socket.io en dev;
// en producción el backend Express corre en el mismo dominio).
export const socket = io({
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    autoConnect: true,
    reconnection: true
});

socket.on('connect', () => {
    console.log('✅ Conectado a Socket.io con ID:', socket.id);
});

socket.on('connect_error', (err) => {
    console.error('❌ Error Socket.io:', err.message);
});
