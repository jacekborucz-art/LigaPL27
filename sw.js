// Service worker: tryb offline. Pliki aplikacji są w pamięci podręcznej przy instalacji,
// potem odpowiedź idzie z pamięci, a w tle pobieramy nowszą wersję (stale-while-revalidate).
const VERSION = 'v0.1.0';
const CACHE = `manager-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/app.js',
  './src/core/rng.js',
  './src/core/store.js',
  './src/config/competitions.js',
  './src/config/calendar2026.js',
  './src/data/clubs_pl.js',
  './src/ui/crest.js',
  './src/ui/dom.js',
  './src/styles/fonts.css',
  './src/styles/tokens.css',
  './src/styles/base.css',
  './src/styles/app.css',
  './assets/icons/icon.svg',
  './assets/icons/icon-192.png',
  './assets/fonts/barlow-latin-400-normal.woff2',
  './assets/fonts/barlow-latin-ext-400-normal.woff2',
  './assets/fonts/barlow-latin-600-normal.woff2',
  './assets/fonts/barlow-latin-ext-600-normal.woff2',
  './assets/fonts/barlow-condensed-latin-500-normal.woff2',
  './assets/fonts/barlow-condensed-latin-ext-500-normal.woff2',
  './assets/fonts/barlow-condensed-latin-700-normal.woff2',
  './assets/fonts/barlow-condensed-latin-ext-700-normal.woff2',
  './assets/fonts/doto-latin-800-normal.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('manager-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });
      const fresh = fetch(request)
        .then((res) => {
          if (res.ok) cache.put(request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fresh;
    }),
  );
});
