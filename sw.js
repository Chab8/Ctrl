// v3: network-first for everything (so deploys are never hidden by a stale cache)
// and the PitchAPI proxy is never cached or intercepted.
const CACHE = 'ctrl-shell-v3';
const SHELL = ['./', './index.html', './manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API calls (PitchAPI proxy and any other serverless route) always go straight to the network.
  if (url.pathname.startsWith('/api/')) return;

  const isAppDocument = request.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/';

  // Network-first: use the freshest HTML/JS/CSS, and fall back to the cached copy only when offline.
  event.respondWith(
    fetch(request, { cache: 'no-store' })
      .then(response => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || (isAppDocument ? caches.match('./index.html') : Response.error())))
  );
});
