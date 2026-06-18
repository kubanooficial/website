const STATIC_CACHE = 'kubano-static-v3';
const DYNAMIC_CACHE = 'kubano-dynamic-v3';
const DYNAMIC_LIMIT = 20;

const STATIC_ASSETS = [
  '/website/',
  '/website/index.html',
  '/website/styles.css',
  '/website/script.js',
  '/website/manifest.json'
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
          .filter(name => ![STATIC_CACHE, DYNAMIC_CACHE].includes(name))
          .map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Recursos externos: solo network (no cacheamos CDN de GitHub raw)
  if (url.origin !== location.origin) {
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

  // Resto (CSS/JS/manifest): cache-first con fallback
  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request).then(res => {
        if (!res || res.status !== 200) return res;
        const clone = res.clone();
        caches.open(DYNAMIC_CACHE).then(cache => {
          cache.put(request, clone);
          // Limpieza simple si excede límite
          cache.keys().then(keys => {
            if (keys.length > DYNAMIC_LIMIT) cache.delete(keys[0]);
          });
        });
        return res;
      });
    })
  );
});