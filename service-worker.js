// Easy Tarkov Service Worker
// Bump CACHE_VERSION on every deploy that changes cached files. This is what
// makes the versioning scheme actually work: activating a new version deletes
// every cache that doesn't match the current name, so nobody gets stuck on
// stale files, and offline users just keep their last-known-good copy until
// they're back online and revisit the site.
const CACHE_VERSION = 'easytarkov-v5';

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

// Genuinely static, rarely-changing files - safe to serve instantly from cache
// without checking the network first.
function isStaticAsset(url){
  return url.pathname.startsWith('/fonts/') || url.pathname === '/favicon.svg' || url.pathname === '/apple-touch-icon.png';
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache =>
      Promise.allSettled(CORE_ASSETS.map(asset => cache.add(asset)))
    )
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

  if(event.request.method !== 'GET') return;
  if(url.origin !== self.location.origin && url.hostname !== 'api.tarkov.dev') return;
  if(isNetworkOnly(url)) return;

  // Static assets (fonts, icons) rarely change - cache-first is safe and fast here.
  if(isStaticAsset(url)){
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if(cached) return cached;
      try{
        const response = await fetch(event.request);
        if(response && response.status === 200){
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone)).catch(() => {});
        }
        return response;
      }catch(err){
        return new Response('Offline, and this file was not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
      }
    })());
    return;
  }

  // Everything else (pages, CSS, JS, data.js) is still actively changing during
  // development - always try the network first, so you're never stuck seeing a
  // stale version while online. The cache here exists purely as an offline
  // fallback, not as the default source of truth.
  event.respondWith((async () => {
    try{
      const response = await fetch(event.request);
      if(response && response.status === 200){
        const clone = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(event.request, clone)).catch(() => {});
      }
      return response;
    }catch(err){
      const cached = await caches.match(event.request);
      if(cached) return cached;
      if(event.request.mode === 'navigate'){
        const fallback = await caches.match('/index.html');
        if(fallback) return fallback;
      }
      return new Response('Offline, and this page was not cached yet.', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  })());
});
