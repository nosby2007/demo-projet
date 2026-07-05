/* LAMYLENOISE enterprise offline shell */
const CACHE_VERSION = 'lamylenoise-v1.1.0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/shop.html',
  '/admin.html',
  '/delivery.html',
  '/contact.html',
  '/faq.html',
  '/style.css',
  '/app.js',
  '/marketplace.js',
  '/firebase-config.js',
  '/app.webmanifest',
  '/404.html'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key !== CACHE_VERSION)
      .map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/404.html')));
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      return response;
    }).catch(() => cached))
  );
});
