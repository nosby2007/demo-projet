/* Adds the trusted Cloud Functions client without duplicating Firebase credentials. */
'use strict';

(function initMarketplaceFunctions() {
  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  if (!window.firebase || !backend) {
    console.warn('Firebase must be initialized before firebase-functions-config.js');
    return;
  }

  const app = firebase.app();
  if (typeof app.functions !== 'function') {
    console.warn('Firebase Functions SDK is not loaded.');
    return;
  }

  backend.functions = app.functions('me-central1');
  backend.tenantId = backend.tenantId || 'lamylenoise';
  backend.brandId = 'sokiva';
  backend.region = 'me-central1';
  window.SokivaFirebase = backend;
  window.AfroMarketFirebase = backend;
})();
