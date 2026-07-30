/* Real push (FCM) registration, layered under the in-app/browser alert toggle in notifications-runtime.js. */
'use strict';

(function pushNotificationRuntime() {
  window.SokivaPush = Object.freeze({ enable: async () => null, disable: async () => {} });

  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  if (!backend?.functions || typeof firebase === 'undefined' || !firebase.messaging || !('serviceWorker' in navigator)) return;

  (async () => {
    let supported = false;
    try { supported = await firebase.messaging.isSupported(); } catch { supported = false; }
    if (!supported) return;

    const vapidKey = window.FCM_VAPID_KEY;
    if (!vapidKey || vapidKey.startsWith('REPLACE_')) return;

    let messaging;
    try {
      messaging = firebase.messaging();
    } catch (error) {
      console.warn('[SOKIVA] Firebase Messaging unavailable', error);
      return;
    }

    function callable(name) {
      return backend.functions.httpsCallable(name);
    }

    let currentToken = null;

    async function enable() {
      try {
        const registration = await navigator.serviceWorker.ready;
        const token = await messaging.getToken({ vapidKey, serviceWorkerRegistration: registration });
        if (!token) return null;
        await callable('registerPushToken')({ token, userAgent: String(navigator.userAgent || '').slice(0, 300) });
        currentToken = token;
        return token;
      } catch (error) {
        console.warn('[SOKIVA] Push registration failed', error);
        return null;
      }
    }

    async function disable() {
      const token = currentToken;
      currentToken = null;
      if (!token) return;
      try {
        await callable('unregisterPushToken')({ token });
        await messaging.deleteToken();
      } catch (error) {
        console.warn('[SOKIVA] Push unregistration failed', error);
      }
    }

    // Foreground messages are already surfaced by the live RTDB toast in
    // notifications-runtime.js; this listener just prevents an unhandled-message warning.
    messaging.onMessage(() => {});

    window.SokivaPush = Object.freeze({ enable, disable });
  })();
})();
