/* SOKIVA resilient offline shell and notification navigation */
const CACHE_VERSION = 'sokiva-v2.13.0';
const APP_SHELL = [
  '/',
  '/index.html',
  '/shop.html',
  '/product.html',
  '/checkout.html',
  '/account.html',
  '/login.html',
  '/register.html',
  '/customer.html',
  '/seller.html',
  '/courier.html',
  '/admin.html',
  '/request.html',
  '/delivery.html',
  '/contact.html',
  '/faq.html',
  '/style.css',
  '/identity.css',
  '/audit.css',
  '/tracking.css',
  '/notifications.css',
  '/admin-enterprise.css',
  '/app.js',
  '/app-core.js',
  '/brand-runtime.js',
  '/identity-runtime.js',
  '/account-runtime.js',
  '/home-runtime.js',
  '/marketplace.js',
  '/saas-runtime.js',
  '/catalog-runtime.js',
  '/product-public-runtime.js',
  '/checkout-runtime-v5.js',
  '/checkout-location-runtime.js',
  '/tracking-runtime.js',
  '/push-config.js',
  '/push-notification-runtime.js',
  '/notifications-runtime.js',
  '/role-sync-runtime.js',
  '/role-request-runtime.js',
  '/audit-runtime.js',
  '/admin-runtime.js',
  '/admin-access-runtime.js',
  '/admin-audit-runtime.js',
  '/admin-support-runtime.js',
  '/admin-risk-runtime.js',
  '/admin-system-runtime.js',
  '/admin-campaign-runtime.js',
  '/admin-governance-runtime.js',
  '/admin-insights-runtime.js',
  '/firebase-config.js',
  '/firebase-functions-config.js',
  '/firebase-storage-config.js',
  '/image-upload-runtime.js',
  '/app.webmanifest',
  '/404.html'
];
const NOTIFICATION_PAGES = new Set(['customer.html', 'seller.html', 'courier.html', 'admin.html', 'account.html']);

// Duplicated from firebase-config.js: this config is public/non-secret, but a service
// worker can't load that DOM-oriented file, so the values are inlined here instead.
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: 'AIzaSyD3TwNnuwKbebGxjJTlVyknvyV267uR28w',
    authDomain: 'sokiva-dev.firebaseapp.com',
    databaseURL: 'https://sokiva-dev-default-rtdb.firebaseio.com',
    projectId: 'sokiva-dev',
    storageBucket: 'sokiva-dev.firebasestorage.app',
    messagingSenderId: '669134589789',
    appId: '1:669134589789:web:167daaa6a8979f416122b4'
  });
  firebase.messaging().onBackgroundMessage(payload => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    self.registration.showNotification(notification.title || 'SOKIVA', {
      body: notification.body || '',
      tag: data.orderId || undefined,
      data: { deepLink: data.deepLink },
      badge: '/favicon.ico'
    });
  });
} catch (error) {
  console.warn('[SOKIVA] Firebase Messaging unavailable in service worker', error);
}

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

function safeNotificationUrl(value) {
  try {
    const url = new URL(String(value || 'account.html'), self.location.origin);
    const page = url.pathname.split('/').filter(Boolean).pop() || '';
    if (url.origin !== self.location.origin || !NOTIFICATION_PAGES.has(page)) {
      return new URL('/account.html', self.location.origin).href;
    }
    return url.href;
  } catch {
    return new URL('/account.html', self.location.origin).href;
  }
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = safeNotificationUrl(event.notification.data?.deepLink);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      if ('navigate' in client) await client.navigate(targetUrl);
      return client.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});

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
