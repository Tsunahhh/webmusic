// Caches the app shell only — never audio, never API state.
//
// /api/stream is the shared broadcast: it always serves whatever is playing
// *right now*, so a cached copy would be the wrong track the moment anyone
// skips, and it's a whole song's worth of bytes besides. Every other /api
// route is live shared state (playback, playlists, history) where a stale
// answer is worse than no answer. Both are simply not handled here, which
// leaves them going straight to the network as if this file didn't exist.
const CACHE = 'musicweb-shell-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop shells from older versions of this file, keyed by CACHE above.
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await self.clients.claim();
    })()
  );
});

// Navigations go to the network first so a running server always wins, with
// the cached shell as the offline fallback. Vite's assets are content-hashed,
// so for those the cache can never be stale — cache-first is both correct and
// the fastest path.
async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(request.mode === 'navigate' ? networkFirst(request) : cacheFirst(request));
});
