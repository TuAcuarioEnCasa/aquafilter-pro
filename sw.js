// ── AquaFilter Pro — Service Worker ────────────────────────────────────────
// Da soporte offline real a la PWA. Sin esto, el manifest.json solo permite
// instalar un acceso directo con ícono — la app seguía necesitando red para
// cargar. Con este archivo, tras la primera visita, AquaFilter Pro funciona
// completo sin conexión (útil en tiendas de peces con mala señal, o sin datos).
//
// Sube la versión del cache cada vez que publiques cambios importantes en
// index.html, para forzar que los usuarios reciban la versión nueva:
const CACHE_NAME = 'aquafilter-pro-v2.5-1';

// "App shell": los archivos base de la PWA. Si alguno no existe con ese
// nombre exacto en tu repo (ej. otro tamaño de ícono), se ignora
// individualmente — un solo archivo faltante no debe romper la instalación
// completa del service worker.
const PRECACHE_URLS = [
    './',
    './index.html',
    './manifest.json',
    './icon_192.png',
    './icon_512.png',
];

// ── INSTALL: precachear el app shell ───────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting(); // activar la versión nueva sin esperar a cerrar pestañas
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) =>
            Promise.all(
                PRECACHE_URLS.map((url) =>
                    cache.add(url).catch((err) => {
                        console.warn('[SW] No se pudo precachear:', url, err.message);
                    })
                )
            )
        )
    );
});

// ── ACTIVATE: limpiar versiones de caché antiguas ──────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

// ── FETCH: red primero, con respaldo en caché ──────────────────────────────
// Si hay conexión, siempre se sirve la versión más reciente (y se actualiza
// el caché con ella). Si falla la red (sin conexión), se sirve del caché.
// Solo se cachean peticiones GET del propio origen — el QR dinámico de
// api.qrserver.com y las fuentes de Google se dejan pasar sin forzar caché,
// ya que el QR debe generarse fresco y las fuentes ya gestionan su propio
// cacheo vía cabeceras HTTP.
self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    event.respondWith(
        fetch(req)
            .then((networkResp) => {
                const isSameOrigin = new URL(req.url).origin === self.location.origin;
                if (networkResp && networkResp.ok && isSameOrigin) {
                    const respClone = networkResp.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, respClone));
                }
                return networkResp;
            })
            .catch(() =>
                caches.match(req).then((cached) => {
                    if (cached) return cached;
                    // Sin caché previo de esta URL exacta: si era una
                    // navegación (abrir la app), al menos servir index.html
                    if (req.mode === 'navigate') return caches.match('./index.html');
                    return Response.error();
                })
            )
    );
});
