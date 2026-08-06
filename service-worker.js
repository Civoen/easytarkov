// Easy Tarkov Service Worker
// Bump CACHE_VERSION on every deploy that changes cached files. This is what
// makes the versioning scheme actually work: activating a new version deletes
// every cache that doesn't match the current name, so nobody gets stuck on
// stale files, and offline users just keep their last-known-good copy until
// they're back online and revisit the site.
const CACHE_VERSION = 'easytarkov-v1';

// The core shell: cached immediately on install, since these are needed on
// almost every page. Individual task/trader/map pages are cached opportunistically
// as they're visited (see the fetch handler below), not all upfront.
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/site.css',
  '/site.js',
  '/data.js',
  '/task.css',
  '/task.js',
  '/trader.css',
  '/trader.js',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/fonts/oswald-v57-latin-500.woff2',
  '/fonts/oswald-v57-latin-600.woff2',
  '/fonts/oswald-v57-latin-700.woff2',
  '/fonts/ibm-plex-mono-400.woff2',
  '/fonts/ibm-plex-mono-500.woff2',
  '/fonts/ibm-plex-mono-600.woff2'
];

// Requests that must always go to the network - never served from cache, since
// they need to be live (user-generated content, or a live price feed).
function isNetworkOnly(url){
  return url.pathname.startsWith('/api/') || url.hostname === 'api.tarkov.dev';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(name => name !== CACHE_VERSION).map(name => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if(event.request.method !== 'GET') return; // never cache non-GET requests
  if(url.origin !== self.location.origin && url.hostname !== 'api.tarkov.dev') return; // ignore other cross-origin requests entirely
  if(isNetworkOnly(url)) return; // let API calls hit the network normally, uncached

  event.respondWith(
    caches.match(event.request).then(cached => {
      if(cached) return cached;
      return fetch(event.request).then(response => {
        // Opportunistically cache this new page/asset for next time, if it loaded successfully.
        if(response && response.status === 200){
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline and not cached - only meaningfully handle page navigations,
        // let other asset failures (like an image) fail naturally.
        if(event.request.mode === 'navigate'){
          return caches.match('/index.html');
        }
      });
    })
  );
});
