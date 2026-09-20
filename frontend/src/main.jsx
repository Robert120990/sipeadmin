import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import './index.css'

// Manejar automáticamente errores de precarga de chunks de Vite al desplegar nueva versión
window.addEventListener('vite:preloadError', () => {
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
