/* Firebase backend for SOKIVA development. */
'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyD3TwNnuwKbebGxjJTlVyknvyV267uR28w",
  authDomain: "sokiva-dev.firebaseapp.com",
  databaseURL: "https://sokiva-dev-default-rtdb.firebaseio.com",
  projectId: "sokiva-dev",
  storageBucket: "sokiva-dev.firebasestorage.app",
  messagingSenderId: "669134589789",
  appId: "1:669134589789:web:167daaa6a8979f416122b4",
  measurementId: "G-TFECL1Y0QQ"
};

(function initFirebase() {
  if (!window.firebase) {
    console.warn('Firebase SDK introuvable. Les modules SOKIVA nécessitent Firebase.');
    return;
  }

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const backend = {
    app,
    auth: firebase.auth(),
    db: firebase.database(),
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    config: firebaseConfig,
    projectId: firebaseConfig.projectId,
    environment: 'development',
    brand: 'SOKIVA',
    brandId: 'sokiva',
    tenantId: 'lamylenoise'
  };

  window.SokivaFirebase = backend;
  // Temporary compatibility alias until all legacy runtime names are removed.
  window.AfroMarketFirebase = backend;

  if (!document.querySelector('script[data-sokiva-brand-runtime]')) {
    const script = document.createElement('script');
    script.src = 'brand-runtime.js';
    script.defer = true;
    script.dataset.sokivaBrandRuntime = 'true';
    document.head.append(script);
  }
})();
