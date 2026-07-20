/* SOKIVA public brand and authenticated account chrome. */
'use strict';

(function sokivaBrandRuntime() {
  if (window.SokivaBrandRuntime) return;

  function loadToastRuntime() {
    if (document.querySelector('script[data-sokiva-toast-runtime]')) return;
    const script = document.createElement('script');
    script.src = 'toast-runtime.js';
    script.defer = true;
    script.dataset.sokivaToastRuntime = 'true';
    document.head.appendChild(script);
  }

  loadToastRuntime();

  const replacements = [
    [/LAMYLENOISE/gi, 'SOKIVA'],
    [/AFROMARKET/gi, 'SOKIVA'],
    [/AfroMarket/gi, 'SOKIVA']
  ];
  let scheduled = false;
  let observerStarted = false;

  function replaceText(value) {
    return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || ''));
  }

  function migrateElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of ['aria-label', 'title', 'placeholder', 'content']) {
      if (!element.hasAttribute(attr)) continue;
      const current = element.getAttribute(attr);
      const next = replaceText(current);
      if (next !== current) element.setAttribute(attr, next);
    }
    if (element.classList?.contains('logo-nova') && element.textContent !== 'SOKIVA') {
      element.textContent = 'SOKIVA';
    }
  }

  function migrateNode(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      const next = replaceText(root.nodeValue);
      if (next !== root.nodeValue) root.nodeValue = next;
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;

    migrateElement(root.nodeType === Node.ELEMENT_NODE ? root : null);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        const next = replaceText(node.nodeValue);
        if (next !== node.nodeValue) node.nodeValue = next;
      } else {
        migrateElement(node);
      }
    }
  }

  function migrateMetadata() {
    const title = replaceText(document.title);
    if (title !== document.title) document.title = title;
    document.querySelectorAll('meta[name="description"], meta[name="application-name"]').forEach(meta => {
      const next = replaceText(meta.content);
      if (next !== meta.content) meta.content = next;
    });
    document.querySelectorAll('link[rel="icon"]').forEach(link => {
      if (link.href.includes('%3EL%3C')) link.href = link.href.replace('%3EL%3C', '%3ES%3C');
    });
  }

  function safePageForRole(profile, isSuperAdmin) {
    if (isSuperAdmin) return 'admin.html';
    return {
      admin: 'admin.html',
      seller: 'seller.html',
      courier: 'courier.html',
      customer: 'customer.html'
    }[profile?.role] || 'account.html';
  }

  async function updateSessionChrome(user) {
    const backend = window.SokivaFirebase;
    const accountLinks = [...document.querySelectorAll('a[href^="account.html"], a.header-action[href="login.html"]')];
    if (!accountLinks.length) return;

    let profile = null;
    let isSuperAdmin = false;
    if (user && backend?.db) {
      try {
        const [snapshot, token] = await Promise.all([
          backend.db.ref(`profiles/${user.uid}`).once('value'),
          user.getIdTokenResult()
        ]);
        profile = snapshot.val();
        isSuperAdmin = token.claims?.isSuperAdmin === true
          && token.claims?.role === 'admin'
          && profile?.role === 'admin';
      } catch (error) {
        console.warn('[SOKIVA] Unable to read session profile', error);
      }
    }

    accountLinks.forEach(link => {
      const label = link.querySelector('.action-label');
      if (user) {
        link.href = safePageForRole(profile, isSuperAdmin);
        link.setAttribute('aria-label', isSuperAdmin ? 'Super administration' : 'Mon compte');
        if (label) label.textContent = isSuperAdmin ? 'Super admin' : 'Compte';
      } else {
        link.href = 'login.html';
        link.setAttribute('aria-label', 'Se connecter');
        if (label) label.textContent = 'Connexion';
      }
    });
  }

  function runMigration() {
    scheduled = false;
    migrateMetadata();
    migrateNode(document.body);
  }

  function scheduleMigration() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(runMigration);
  }

  function startObserverAndSession() {
    if (observerStarted) return;
    observerStarted = true;
    const observer = new MutationObserver(scheduleMigration);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const backend = window.SokivaFirebase;
    if (backend?.auth) backend.auth.onAuthStateChanged(updateSessionChrome);
  }

  runMigration();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserverAndSession, { once: true });
  } else {
    startObserverAndSession();
  }

  window.SokivaBrandRuntime = Object.freeze({ migrate: runMigration, replaceText });
})();
