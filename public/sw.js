/**
 * Merge Knights service worker.
 *
 * The build output is content-hashed and the art is 500+ static PNGs, so
 * rather than maintain a precache manifest this caches the shell up front
 * and then everything else on first use. After one playthrough the game
 * runs fully offline.
 *
 * Bump CACHE when the shell changes; old caches are dropped on activate.
 */
const CACHE = 'merge-knights-v1';

/** Resolved against the SW's own scope, so a /<repo>/ subpath works. */
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one 404 cannot fail the whole install.
      .then((cache) =>
        Promise.all(
          SHELL.map((url) =>
            cache.add(new Request(url, { cache: 'reload' })).catch(() => {}),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first so a deploy is picked up, falling back to
  // the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches
            .match('./index.html')
            .then((hit) => hit ?? caches.match('./'))
            .then((hit) => hit ?? Response.error()),
        ),
    );
    return;
  }

  // Everything else (hashed JS/CSS, PNGs): cache first — these never
  // change under a given URL, so a hit is always safe.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => hit ?? Response.error());
    }),
  );
});
