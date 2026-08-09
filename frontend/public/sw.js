/* SIPE Admin — Service Worker
 * Estrategia:
 *  - App shell precacheado (index.html, manifest, version.json, iconos) con cache name
 *    basado en el buildId de /version.json → cada release genera una cache nueva.
 *  - /index.html y / : network-first (siempre recibe la versión más nueva con red).
 *  - /assets/* (hasheados e inmutables): cache-first con revalidate en segundo plano.
 *  - /version.json : network-first (es el detector de nuevas versiones).
 *  - /api/* : NUNCA se cachea (datos sensibles/sesión).
 */
const VERSION_URL = '/version.json';

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            let version = { version: '0.0.0', buildId: 'unknown' };
            try {
                const res = await fetch(VERSION_URL, { cache: 'no-store' });
                version = await res.json();
            } catch (e) { /* sin red durante instalación */ }
            const cacheName = `sipeadmin-${version.buildId}`;
            self.__CACHE_NAME = cacheName;
            const cache = await caches.open(cacheName);
            await cache.addAll([
                '/',
                '/index.html',
                VERSION_URL,
                '/manifest.webmanifest',
                '/favicon.svg',
                '/icons/icon-192.png',
                '/icons/icon-512.png',
                '/icons/icon-maskable-512.png',
                '/icons/apple-touch-icon.png',
            ]);
            self.skipWaiting();
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            const current = self.__CACHE_NAME || 'sipeadmin-unknown';
            await Promise.all(keys.filter((k) => k !== current).map((k) => caches.delete(k)));
            await self.clients.claim();
        })()
    );
});

async function networkFirst(request, fallbackCache) {
    try {
        const res = await fetch(request);
        if (res && res.ok && (request.method === 'GET' || request.method === 'HEAD')) {
            const cache = await caches.open(fallbackCache || self.__CACHE_NAME || 'sipeadmin-unknown');
            cache.put(request, res.clone());
        }
        return res;
    } catch (err) {
        const cached = await caches.match(request);
        return cached || Response.error();
    }
}

async function cacheFirstWithRevalidate(request) {
    const cache = await caches.open(self.__CACHE_NAME || 'sipeadmin-unknown');
    const cached = await cache.match(request);
    const fetchPromise = fetch(request)
        .then((res) => {
            if (res && res.ok) cache.put(request, res.clone());
            return res;
        })
        .catch(() => cached || Response.error());
    return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    if (event.request.method !== 'GET' && event.request.method !== 'HEAD') return;
    if (url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/')) return;

    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === VERSION_URL) {
        event.respondWith(networkFirst(event.request));
        return;
    }
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirstWithRevalidate(event.request));
        return;
    }
    // Resto de archivos estáticos (iconos, manifest, favicon, sw): revalidate
    event.respondWith(cacheFirstWithRevalidate(event.request));
});

// Mensajes de la app (actualización de versión)
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
