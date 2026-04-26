const CACHE_NAME = 'alliance-tracker-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/style.css',
  '/manifest.json',
];

// Install: cache static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(STATIC_ASSETS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - GAS API calls → always network (never cache)
// - Everything else → cache-first, fall back to network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never cache GAS API calls or Google auth calls
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('accounts.google.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first for all other requests
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Cache successful GET responses
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    }).catch(() => {
      // Offline fallback — serve the shell for navigation requests
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
    })
  );
});
