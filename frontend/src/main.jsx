import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { recordGlobalError } from './utils/errorDiagnostics'
import './index.css'

// Registrar excepciones y rechazos globales en el buffer de diagnóstico
window.addEventListener('error', (event) => {
    recordGlobalError(event);
});
window.addEventListener('unhandledrejection', (event) => {
    recordGlobalError(event);
});

// Manejar automáticamente errores de precarga de chunks de Vite al desplegar nueva versión
// Con guarda en sessionStorage para evitar bucles infinitos de recarga si un asset falta temporalmente
window.addEventListener('vite:preloadError', () => {
    try {
        const key = 'sipe_vite_preload_reload_at';
        const lastReload = Number(sessionStorage.getItem(key) || '0');
        const now = Date.now();
        if (lastReload && now - lastReload < 30000) {
            console.warn('Vite preload error: recarga omitida por cooldown de 30s para evitar bucle.');
            return;
        }
        sessionStorage.setItem(key, String(now));
    } catch (_) {
        // Ignorar si sessionStorage no está disponible
    }
    console.warn('Vite preload error: recargando para obtener la versión más reciente.');
    window.location.reload();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => {
            console.warn('Service Worker registration failed:', err);
        });
    });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
