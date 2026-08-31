// ── Bump this version string on every deploy to invalidate stale caches ──
// e.g. alliance-tracker-v2, v3, or use a build hash injected at deploy time.
<<<<<<< HEAD
const CACHE_NAME = 'alliance-tracker-v6';
=======
const CACHE_NAME = 'alliance-tracker-v5';
>>>>>>> b486dca88bcdf73591cffd21ff1911fb96173b92
// app.js and index.html are excluded from precache — they're fetched
// network-first so auth/logic fixes always land without a hard refresh.
const STATIC_ASSETS = [
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

  // Network-first for app.js and index.html so deploys land immediately
  if (url.pathname === '/app.js' || url.pathname === '/style.css' || url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(
      fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for all other requests (fonts, icons, style.css etc.)
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
      // Offline fallback
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
      // For non-document assets (scripts, styles, images) return a minimal offline response
      // rather than letting the fetch reject with an unhandled error.
      return new Response('', { status: 503, statusText: 'Service Unavailable - offline' });
    })
  );
});