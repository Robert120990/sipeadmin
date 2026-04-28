import { io } from 'socket.io-client';

// Forzamos el host local y puerto 5001 donde el backend sabemos que está escuchando.
// Ignoramos VITE_API_URL en desarrollo porque apunta incorrectamente a 5002.
const URL = 'http://127.0.0.1:5001';


export const socket = io(URL, {
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
