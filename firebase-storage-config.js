/* Adds the trusted Firebase Storage client without duplicating Firebase credentials. */
'use strict';

(function initMarketplaceStorage() {
  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  if (!window.firebase || !backend) {
    console.warn('Firebase must be initialized before firebase-storage-config.js');
    return;
  }

  if (typeof firebase.storage !== 'function') {
    console.warn('Firebase Storage SDK is not loaded.');
    return;
  }

  backend.storage = firebase.storage();
  window.SokivaFirebase = backend;
  window.AfroMarketFirebase = backend;
})();
