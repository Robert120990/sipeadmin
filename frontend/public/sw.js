/* SIPE Admin — Service Worker
 * Estrategia PWA robusta:
 *  - Peticiones de navegación SPA (mode === 'navigate'): Network-First con fallback a /index.html cacheado.
 *    Esto asegura que cualquier ruta (/login, /dashboard, etc.) siempre cargue los bundles de JS actualizados.
 *  - /assets/* (hasheados por Vite): Cache-First con almacenamiento en caché.
 *  - /version.json: Network-First (detector de versiones).
 *  - /api/* y /socket.io/*: NUNCA se cachean (datos dinámicos de sesión).
 *  - Recursos estáticos de shell (iconos, manifest, favicon): Cache-First.
 */

const VERSION_URL = '/version.json';

async function getActiveCacheName() {
    const keys = await caches.keys();
    const found = keys.find((k) => k.startsWith('sipeadmin-') && k !== 'sipeadmin-unknown');
    return found || 'sipeadmin-shell';
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            let buildId = 'shell';
            try {
                const res = await fetch(VERSION_URL, { cache: 'no-store' });
                if (res.ok) {
                    const version = await res.json();
                    if (version?.buildId) buildId = version.buildId;
                }
            } catch (e) {
                // Sin red durante install inicial
            }

            const cacheName = `sipeadmin-${buildId}`;
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
            let targetCache = null;
            try {
                const res = await fetch(VERSION_URL, { cache: 'no-store' });
                if (res.ok) {
                    const v = await res.json();
                    if (v?.buildId) targetCache = `sipeadmin-${v.buildId}`;
                }
            } catch (e) {
                // Modo offline
            }

            const keys = await caches.keys();
            if (!targetCache) {
                targetCache = keys.filter((k) => k.startsWith('sipeadmin-')).sort().pop();
            }

            await Promise.all(
                keys.filter((k) => targetCache && k !== targetCache).map((k) => caches.delete(k))
            );
            await self.clients.claim();
        })()
    );
});

async function cacheFirstWithRevalidate(request) {
    const cacheName = await getActiveCacheName();
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const res = await fetch(request);
        if (res && res.ok) {
            cache.put(request, res.clone());
        }
        return res;
    } catch (err) {
        return Response.error();
    }
}

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Solo peticiones GET/HEAD y del mismo origen
    if (event.request.method !== 'GET' && event.request.method !== 'HEAD') return;
    if (url.origin !== self.location.origin) return;

    // API y WebSocket nunca se interceptan ni se cachean
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

    // 1. Petición del detector de versiones: siempre a la red
    if (url.pathname === VERSION_URL) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).catch(async () => {
                const cacheName = await getActiveCacheName();
                const cache = await caches.open(cacheName);
                return (await cache.match(VERSION_URL)) || Response.error();
            })
        );
        return;
    }

    // 2. NAVEGACIÓN SPA (/login, /dashboard, /dashboard/*, etc.):
    // Modo navigate siempre obtiene el index.html nuevo de la red.
    // Si falla (offline), entrega el index.html del shell cacheado.
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(async (res) => {
                    if (res && res.ok) {
                        const cacheName = await getActiveCacheName();
                        const cache = await caches.open(cacheName);
                        cache.put('/index.html', res.clone());
                    }
                    return res;
                })
                .catch(async () => {
                    const cacheName = await getActiveCacheName();
                    const cache = await caches.open(cacheName);
                    const fallback = (await cache.match('/index.html')) || (await cache.match('/'));
                    return fallback || Response.error();
                })
        );
        return;
    }

    // 3. Assets JS/CSS con hash inmutable: Cache-First
    if (url.pathname.startsWith('/assets/')) {
        event.respondWith(cacheFirstWithRevalidate(event.request));
        return;
    }

    // 4. Recursos estáticos generales (iconos, favicon, manifest): Cache-First
    event.respondWith(cacheFirstWithRevalidate(event.request));
});

// Mensajes de la app (actualización forzada de versión)
self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
