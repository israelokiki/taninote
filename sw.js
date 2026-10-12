// TaniNote service worker: keeps the app usable offline. Only same-origin files are cached.
const CACHE = 'taninote-v1.6.1';
const CORE = [
  './', 'index.html', 'app.css', 'app.js', 'manifest.webmanifest',
  'icons/icon.svg', 'images/sidebar-photo.jpg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'vendor/pdf.min.js', 'vendor/pdf.worker.min.js', 'vendor/pdf-lib.min.js', 'vendor/mammoth.browser.min.js',
  'vendor/jszip.min.js', 'vendor/marked.min.js', 'vendor/purify.min.js', 'vendor/html2canvas.min.js',
  'vendor/phosphor/regular/style.css', 'vendor/phosphor/regular/Phosphor.woff2',
  'vendor/phosphor/fill/style.css', 'vendor/phosphor/fill/Phosphor-Fill.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // Music streams in byte ranges; leave it to the network rather than caching partial responses.
  if (url.pathname.includes('/music/')) return;
  // Libraries never change for a version: cache first. App files: network first so updates arrive.
  if (url.pathname.includes('/vendor/') || url.pathname.includes('/icons/')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  e.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});

// Study reminders: tapping a notification focuses TaniNote (or opens it) and opens that session's file.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const session = e.notification.data && e.notification.data.session;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const win = list[0];
    if (win) {
      if (session) win.postMessage({ type: 'reminder-click', session });
      return win.focus();
    }
    return self.clients.openWindow(session ? './?session=' + encodeURIComponent(session) : './');
  }));
});
