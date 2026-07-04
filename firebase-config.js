/* Firebase backend for AFROMARKET / LAMYLENOISE */
'use strict';

const firebaseConfig = {
  apiKey: "AIzaSyBByAA76jI7hHup-mFQWx1u9rHEkRtfEwE",
  authDomain: "nursehome-7dc3f.firebaseapp.com",
  databaseURL: "https://nursehome-7dc3f-default-rtdb.firebaseio.com",
  projectId: "nursehome-7dc3f",
  storageBucket: "nursehome-7dc3f.firebasestorage.app",
  messagingSenderId: "1098942563500",
  appId: "1:1098942563500:web:c04f64d60ccd50a9f04b09"
};

(function initFirebase() {
  if (!window.firebase) {
    console.warn('Firebase SDK introuvable. Les modules backend passent en mode local.');
    return;
  }

  const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);

  window.AfroMarketFirebase = {
    app,
    auth: firebase.auth(),
    db: firebase.database(),
    timestamp: firebase.database.ServerValue.TIMESTAMP,
    config: firebaseConfig,
    projectId: firebaseConfig.projectId
  };
})();
