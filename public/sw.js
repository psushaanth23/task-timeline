/* Task Timeline service worker.
 *
 * Goal: make the app installable on the phone and let its SHELL open even when
 * the Mac is briefly unreachable — without ever serving stale task DATA.
 *
 * Strategy:
 *   - /api/*            → never touched. The app's own fetch handles it, always
 *                         live, so you never see an out-of-date board.
 *   - Vite internals    → bypassed (HMR, @vite, @react-refresh, ?t= module
 *                         reloads) so dev tooling keeps working.
 *   - navigations       → network-first, falling back to the cached shell when
 *                         offline, so launching the installed app still paints.
 *   - other same-origin → stale-while-revalidate: fast from cache, refreshed in
 *                         the background (icons, fonts, built JS/CSS).
 */
const CACHE = 'timeline-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => undefined)),
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

const bypass = (url) =>
  url.pathname.startsWith('/api/') ||
  url.pathname.startsWith('/@') || // /@vite, /@react-refresh, /@fs
  url.pathname.startsWith('/node_modules/') ||
  url.search.includes('import') ||
  url.search.includes('t='); // Vite's cache-busting module reload param

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Only handle our own origin; never interfere with the data API or dev tooling.
  if (url.origin !== self.location.origin || bypass(url)) return;

  // App launches / route loads: try the network, fall back to the cached shell.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Everything else same-origin: serve cached fast, refresh in the background.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
