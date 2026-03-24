// 族譜紀念堂 Service Worker
const CACHE_NAME = 'zupu-v3';
const ASSETS = [
   './index.html',
   './icon-192.png',
  './icon-512.png',
  './manifest.json',
];

// Install: cache all assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: Cache First for local assets, Network First for API calls
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Always go to network for Anthropic API
  if (url.hostname === 'api.anthropic.com') {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache First for everything else
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        // Cache valid responses
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
