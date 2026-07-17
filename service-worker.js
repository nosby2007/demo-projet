/* LAMYLENOISE resilient offline shell */
const CACHE_VERSION = 'lamylenoise-v1.4.0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/shop.html',
  '/product.html',
  '/checkout.html',
  '/customer.html',
  '/seller.html',
  '/courier.html',
  '/admin.html',
  '/request.html',
  '/delivery.html',
  '/contact.html',
  '/faq.html',
  '/style.css',
  '/app.js',
  '/marketplace.js',
  '/saas-runtime.js',
  '/catalog-runtime.js',
  '/product-public-runtime.js',
  '/checkout-runtime-v5.js',
  '/role-sync-runtime.js',
  '/firebase-config.js',
  '/firebase-functions-config.js',
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

function navigationCacheKey(pathname) {
  if (pathname === '/') return '/index.html';
  if (/\.[a-z0-9]+$/i.test(pathname)) return pathname;
  return `${pathname}.html`;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          return (await caches.match(request))
            || (await caches.match(navigationCacheKey(url.pathname)))
            || (await caches.match('/index.html'))
            || caches.match('/404.html');
        })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
