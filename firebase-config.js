/* Firebase backend for SOKIVA development. */
'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyD3IwNnwKWbebGxjJTLVyknvyV267uR28w",
  authDomain: "sokiva-dev.firebaseapp.com",
  databaseURL: "https://sokiva-dev-default-rtdb.firebaseio.com",
  projectId: "sokiva-dev",
  storageBucket: "sokiva-dev.firebasestorage.app",
  messagingSenderId: "669134589789",
  appId: "1:669134589789:web:167daaa6a8979f416122b4",
  measurementId: "G-TFECL1VPQQ"
};

(function initFirebase() {
  if (!window.firebase) {
    console.warn('Firebase SDK introuvable. Les modules backend passent en mode local.');
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
    brand: 'SOKIVA'
  };

  window.SokivaFirebase = backend;
  // Alias temporaire pour les runtimes existants pendant la migration de marque.
  window.AfroMarketFirebase = backend;
})();
