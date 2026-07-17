/* Adds the trusted Cloud Functions client without duplicating Firebase credentials. */
'use strict';

(function initMarketplaceFunctions() {
  if (!window.firebase || !window.AfroMarketFirebase) {
    console.warn('Firebase must be initialized before firebase-functions-config.js');
    return;
  }

  const app = firebase.app();
  if (typeof app.functions !== 'function') {
    console.warn('Firebase Functions SDK is not loaded.');
    return;
  }

  window.AfroMarketFirebase.functions = app.functions('me-central1');
  window.AfroMarketFirebase.tenantId = 'lamylenoise';
  window.AfroMarketFirebase.region = 'me-central1';
})();
