const STATIC_CACHE = 'kubano-static-v2';
const DYNAMIC_CACHE = 'kubano-dynamic-v2';
const IMG_CACHE = 'kubano-images-v2';
const DYNAMIC_LIMIT = 30;
const IMG_LIMIT = 50;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/script.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => ![STATIC_CACHE, DYNAMIC_CACHE, IMG_CACHE].includes(name))
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

const limitCache = async (cacheName, limit) => {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > limit) {
    await cache.delete(keys[0]);
  }
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Fuentes externas: network-first con fallback
  if (url.origin !== location.origin) {    if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
      event.respondWith(
        caches.open(STATIC_CACHE).then(cache =>
          cache.match(request).then(cached =>
            cached || fetch(request).then(res => {
              cache.put(request, res.clone());
              return res;
            })
          )
        )
      );
    }
    return;
  }

  // Documentos: network-first con fallback a cache
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then(res => {
          const clone = res.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Imágenes: stale-while-revalidate
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMG_CACHE).then(async cache => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request)
          .then(res => {
            if (res.ok) {
              cache.put(request, res.clone());
              limitCache(IMG_CACHE, IMG_LIMIT);
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Resto: cache-first con fallback a network  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, clone);
          limitCache(DYNAMIC_CACHE, DYNAMIC_LIMIT);
        });
        return res;
      });
    })
  );
});