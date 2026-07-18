/* SOKIVA public brand and session chrome migration. */
'use strict';

(function sokivaBrandRuntime() {
  if (window.SokivaBrandRuntime) return;

  const replacements = [
    [/LAMYLENOISE/gi, 'SOKIVA'],
    [/AFROMARKET/gi, 'SOKIVA'],
    [/AfroMarket/gi, 'SOKIVA']
  ];
  let scheduled = false;

  function replaceText(value) {
    return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), String(value || ''));
  }

  function setText(element, value) {
    if (element && element.textContent !== value) element.textContent = value;
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

  function sanitizeSharedChrome() {
    const topbarMessage = document.querySelector('.topbar-inner > span');
    setText(topbarMessage, 'Pilote SOKIVA aux UAE — fonctionnalités activées progressivement après validation');

    document.querySelectorAll('.topbar-links a').forEach(link => {
      if (/WhatsApp|\+971/i.test(link.textContent || '')) {
        link.href = 'contact.html';
        setText(link, 'Support pilote');
      }
    });

    setText(
      document.querySelector('.footer-brand > p'),
      'Marketplace SOKIVA en phase pilote : comptes Firebase, catalogue validé, commandes sécurisées et livraison suivie.'
    );

    document.querySelectorAll('.site-footer a').forEach(link => {
      if (/WhatsApp|\+971/i.test(link.textContent || '')) {
        link.href = 'contact.html';
        setText(link, 'Canaux de support');
      }
    });

    const paymentIcons = document.querySelector('.payment-icons');
    if (paymentIcons && paymentIcons.dataset.sokivaPilot !== 'true') {
      paymentIcons.replaceChildren();
      paymentIcons.append(Object.assign(document.createElement('span'), {
        className: 'payment-badge',
        textContent: 'COD pilote'
      }));
      paymentIcons.dataset.sokivaPilot = 'true';
    }

    const copyright = document.querySelector('.footer-bottom > p');
    setText(copyright, '© 2026 SOKIVA — environnement pilote. Informations commerciales définitives à venir.');

    const trustCards = document.querySelectorAll('.enterprise-trust-grid > div');
    const trustContent = [
      ['Firebase Hosting', 'Environnement de développement avec cache PWA'],
      ['RBAC contrôlé', 'Client, vendeur, livreur, admin et propriétaire'],
      ['Données réelles', 'Aucun profil, commande ou contact fictif'],
      ['Livraison pilote', 'Tracking privé et ETA approximative']
    ];
    trustCards.forEach((card, index) => {
      const content = trustContent[index];
      if (!content) return;
      setText(card.querySelector('strong'), content[0]);
      setText(card.querySelector('span'), content[1]);
    });
  }

  function safePageForRole(profile) {
    if (profile?.isSuperAdmin === true) return 'admin.html';
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
    if (user && backend?.db) {
      try {
        profile = (await backend.db.ref(`profiles/${user.uid}`).once('value')).val();
      } catch (error) {
        console.warn('[SOKIVA] Unable to read session profile', error);
      }
    }

    accountLinks.forEach(link => {
      const label = link.querySelector('.action-label');
      if (user) {
        link.href = safePageForRole(profile);
        link.setAttribute('aria-label', profile?.isSuperAdmin ? 'Super administration' : 'Mon compte');
        if (label) label.textContent = profile?.isSuperAdmin ? 'Super admin' : 'Compte';
      } else {
        link.href = 'login.html';
        link.setAttribute('aria-label', 'Se connecter');
        if (label) label.textContent = 'Connexion';
      }
    });

    document.querySelectorAll('[data-auth-create-account]').forEach(link => {
      link.hidden = Boolean(user);
    });
  }

  function runMigration() {
    scheduled = false;
    migrateMetadata();
    migrateNode(document.body);
    sanitizeSharedChrome();
  }

  function scheduleMigration() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(runMigration);
  }

  function boot() {
    runMigration();
    const observer = new MutationObserver(scheduleMigration);
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    const backend = window.SokivaFirebase;
    if (backend?.auth) backend.auth.onAuthStateChanged(updateSessionChrome);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();

  window.SokivaBrandRuntime = Object.freeze({ migrate: runMigration, replaceText });
})();
