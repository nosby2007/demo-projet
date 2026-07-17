/* SOKIVA private realtime notification center. Browser alerts require explicit consent. */
'use strict';

(function notificationRuntime() {
  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  if (!backend?.auth || !backend?.db || !backend?.functions) return;
  if (window.SokivaNotifications) return;

  const state = {
    user: null,
    ref: null,
    handler: null,
    initialized: false,
    knownIds: new Set(),
    rows: [],
    elements: null
  };
  const allowedPages = new Set(['customer.html', 'seller.html', 'courier.html', 'admin.html']);

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function iconName(type) {
    const icons = {
      order_received: 'shopping-bag',
      order_confirmed: 'badge-check',
      order_preparing: 'package-open',
      order_ready: 'package-check',
      courier_on_way: 'truck',
      courier_nearby: 'map-pin',
      order_delivered: 'circle-check-big',
      order_cancelled: 'circle-x',
      order_refunded: 'badge-dollar-sign',
      seller_new_order: 'shopping-cart',
      seller_order_delivered: 'wallet-cards',
      delivery_available: 'route',
      delivery_started: 'navigation',
      courier_earning_available: 'wallet',
      admin_order_cancelled: 'shield-alert',
      admin_order_refunded: 'shield-alert'
    };
    return icons[type] || 'bell';
  }

  function formatTime(value) {
    if (!value) return '';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Dubai'
    }).format(new Date(Number(value)));
  }

  function safeDeepLink(value) {
    try {
      const url = new URL(String(value || ''), window.location.href);
      const page = url.pathname.split('/').filter(Boolean).pop() || '';
      if (url.origin !== window.location.origin || !allowedPages.has(page)) return null;
      return `${page}${url.search}`;
    } catch {
      return null;
    }
  }

  function callable(name) {
    return backend.functions.httpsCallable(name);
  }

  function preferenceKey() {
    return state.user ? `sokiva-browser-alerts:${state.user.uid}` : 'sokiva-browser-alerts';
  }

  function browserAlertsEnabled() {
    return Boolean(
      state.user &&
      'Notification' in window &&
      Notification.permission === 'granted' &&
      localStorage.getItem(preferenceKey()) === 'enabled'
    );
  }

  function refreshBrowserStatus() {
    if (!state.elements) return;
    const { permissionButton, browserStatus } = state.elements;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      permissionButton.disabled = true;
      permissionButton.textContent = 'Alertes non prises en charge';
      browserStatus.textContent = 'Le centre de notifications dans l’application reste disponible.';
      return;
    }
    if (Notification.permission === 'denied') {
      permissionButton.disabled = true;
      permissionButton.textContent = 'Alertes bloquées';
      browserStatus.textContent = 'Réactivez les notifications depuis les réglages du navigateur ou de l’application.';
      return;
    }
    const enabled = browserAlertsEnabled();
    permissionButton.disabled = !state.user;
    permissionButton.textContent = enabled ? 'Désactiver les alertes navigateur' : 'Activer les alertes navigateur';
    browserStatus.textContent = enabled
      ? 'Les alertes apparaissent lorsque SOKIVA est ouverte ou active en arrière-plan dans le navigateur.'
      : 'L’activation est facultative et nécessite votre autorisation explicite.';
  }

  function updateBadge() {
    if (!state.elements) return;
    const unread = state.rows.filter(row => !row.readAt).length;
    state.elements.badge.hidden = unread === 0;
    state.elements.badge.textContent = unread > 99 ? '99+' : String(unread);
    state.elements.button.setAttribute('aria-label', unread
      ? `Notifications, ${unread} non lue${unread > 1 ? 's' : ''}`
      : 'Notifications');
    state.elements.markAllButton.disabled = unread === 0;
    state.elements.subtitle.textContent = unread
      ? `${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}`
      : 'Tout est à jour';
  }

  function closeDrawer() {
    if (!state.elements) return;
    state.elements.overlay.classList.remove('open');
    state.elements.overlay.setAttribute('aria-hidden', 'true');
    state.elements.button.setAttribute('aria-expanded', 'false');
    document.body.style.removeProperty('overflow');
  }

  function openDrawer() {
    if (!state.elements) return;
    state.elements.overlay.classList.add('open');
    state.elements.overlay.setAttribute('aria-hidden', 'false');
    state.elements.button.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    state.elements.closeButton.focus();
  }

  async function markRead(notification) {
    if (!state.user || notification.readAt) return;
    try {
      await callable('markNotificationRead')({ notificationId: notification.id });
    } catch (error) {
      console.warn('[SOKIVA] Notification read state unavailable', error);
    }
  }

  async function openNotification(notification) {
    await markRead(notification);
    const deepLink = safeDeepLink(notification.deepLink);
    if (deepLink) window.location.assign(deepLink);
  }

  function renderList() {
    if (!state.elements) return;
    const list = state.elements.list;
    list.replaceChildren();

    if (!state.user) {
      const empty = create('div', 'notification-empty');
      const icon = create('i');
      icon.setAttribute('data-lucide', 'log-in');
      empty.append(icon, create('strong', '', 'Connectez-vous pour voir vos notifications.'));
      list.append(empty);
    } else if (!state.rows.length) {
      const empty = create('div', 'notification-empty');
      const icon = create('i');
      icon.setAttribute('data-lucide', 'bell-off');
      empty.append(icon, create('strong', '', 'Aucune notification'), create('span', '', 'Les mises à jour de vos commandes apparaîtront ici.'));
      list.append(empty);
    } else {
      state.rows.forEach(notification => {
        const card = create('button', `notification-card${notification.readAt ? '' : ' unread'}${notification.priority === 'high' ? ' high' : ''}`);
        card.type = 'button';
        card.dataset.notificationId = notification.id;

        const iconWrap = create('span', 'notification-icon');
        const icon = create('i');
        icon.setAttribute('data-lucide', iconName(notification.type));
        iconWrap.append(icon);

        const copy = create('span', 'notification-copy');
        const title = create('strong', '', notification.title || 'Mise à jour SOKIVA');
        const body = create('span', '', notification.body || 'Votre commande a été mise à jour.');
        const time = create('time', '', formatTime(notification.createdAt));
        time.dateTime = new Date(Number(notification.createdAt || Date.now())).toISOString();
        copy.append(title, body, time);
        card.append(iconWrap, copy);
        card.addEventListener('click', () => openNotification(notification));
        list.append(card);
      });
    }

    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [list] });
    updateBadge();
  }

  function showLiveToast(notification) {
    const toast = create('aside', 'notification-live-toast');
    toast.setAttribute('role', 'status');
    const icon = create('i');
    icon.setAttribute('data-lucide', iconName(notification.type));
    const copy = create('div');
    copy.append(
      create('strong', '', notification.title || 'Mise à jour SOKIVA'),
      create('span', '', notification.body || 'Votre commande a été mise à jour.')
    );
    const close = create('button', '', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Fermer la notification');
    close.addEventListener('click', () => toast.remove());
    toast.addEventListener('click', event => {
      if (event.target !== close) openNotification(notification);
    });
    toast.append(icon, copy, close);
    document.body.append(toast);
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [toast] });
    setTimeout(() => toast.remove(), 7000);
  }

  async function showBrowserNotification(notification) {
    if (!browserAlertsEnabled() || !document.hidden) return;
    const deepLink = safeDeepLink(notification.deepLink);
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(notification.title || 'SOKIVA', {
        body: notification.body || 'Votre commande a été mise à jour.',
        tag: notification.id,
        renotify: notification.priority === 'high',
        data: { deepLink },
        badge: '/favicon.ico'
      });
    } catch (error) {
      console.warn('[SOKIVA] Browser notification unavailable', error);
    }
  }

  function handleSnapshot(snapshot) {
    const rows = Object.values(snapshot.val() || {})
      .filter(row => row && row.id)
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const currentIds = new Set(rows.map(row => row.id));

    if (state.initialized) {
      const additions = rows
        .filter(row => !state.knownIds.has(row.id))
        .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
      additions.forEach(notification => {
        showLiveToast(notification);
        showBrowserNotification(notification);
      });
    }

    state.rows = rows;
    state.knownIds = currentIds;
    state.initialized = true;
    renderList();
  }

  function unsubscribe() {
    if (state.ref && state.handler) state.ref.off('value', state.handler);
    state.ref = null;
    state.handler = null;
    state.initialized = false;
    state.knownIds.clear();
    state.rows = [];
  }

  function subscribe(user) {
    unsubscribe();
    state.user = user;
    if (!user) {
      renderList();
      refreshBrowserStatus();
      return;
    }
    state.ref = backend.db.ref(`userNotifications/${user.uid}`)
      .orderByChild('createdAt')
      .limitToLast(100);
    state.handler = snapshot => handleSnapshot(snapshot);
    state.ref.on('value', state.handler, error => {
      console.warn('[SOKIVA] Notification inbox unavailable', error);
      state.rows = [];
      renderList();
    });
    refreshBrowserStatus();
  }

  async function toggleBrowserAlerts() {
    if (!state.user || !('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (browserAlertsEnabled()) {
      localStorage.removeItem(preferenceKey());
      refreshBrowserStatus();
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') localStorage.setItem(preferenceKey(), 'enabled');
    } catch (error) {
      console.warn('[SOKIVA] Notification permission unavailable', error);
    }
    refreshBrowserStatus();
  }

  async function markAllRead() {
    if (!state.user) return;
    state.elements.markAllButton.disabled = true;
    try {
      await callable('markAllNotificationsRead')({});
    } catch (error) {
      console.warn('[SOKIVA] Unable to mark all notifications read', error);
    }
  }

  function mount() {
    const headerActions = document.querySelector('.header-actions');
    if (!headerActions || document.getElementById('notification-toggle')) return;

    const button = create('button', 'icon-btn header-action notification-action');
    button.id = 'notification-toggle';
    button.type = 'button';
    button.setAttribute('aria-label', 'Notifications');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'notification-drawer');
    const bell = create('i');
    bell.setAttribute('data-lucide', 'bell');
    const badge = create('span', 'notification-count', '0');
    badge.hidden = true;
    const label = create('span', 'action-label', 'Alertes');
    button.append(bell, badge, label);
    headerActions.insertBefore(button, document.getElementById('cart-toggle') || null);

    const overlay = create('div', 'notification-overlay');
    overlay.id = 'notification-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const drawer = create('aside', 'notification-drawer');
    drawer.id = 'notification-drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-modal', 'true');
    drawer.setAttribute('aria-labelledby', 'notification-title');

    const header = create('header', 'notification-header');
    const heading = create('div');
    const title = create('h2', '', 'Notifications');
    title.id = 'notification-title';
    const subtitle = create('p', '', 'Tout est à jour');
    heading.append(title, subtitle);
    const closeButton = create('button', 'icon-btn');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Fermer les notifications');
    const closeIcon = create('i');
    closeIcon.setAttribute('data-lucide', 'x');
    closeButton.append(closeIcon);
    header.append(heading, closeButton);

    const toolbar = create('div', 'notification-toolbar');
    const markAllButton = create('button', 'btn-link', 'Tout marquer comme lu');
    markAllButton.type = 'button';
    const permissionButton = create('button', 'btn-link', 'Activer les alertes navigateur');
    permissionButton.type = 'button';
    toolbar.append(markAllButton, permissionButton);

    const list = create('div', 'notification-list');
    list.setAttribute('aria-live', 'polite');
    const browserStatus = create('p', 'notification-browser-status');
    drawer.append(header, toolbar, list, browserStatus);
    overlay.append(drawer);
    document.body.append(overlay);

    state.elements = {
      button,
      badge,
      overlay,
      drawer,
      closeButton,
      subtitle,
      markAllButton,
      permissionButton,
      list,
      browserStatus
    };

    button.addEventListener('click', openDrawer);
    closeButton.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeDrawer();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && overlay.classList.contains('open')) closeDrawer();
    });
    markAllButton.addEventListener('click', markAllRead);
    permissionButton.addEventListener('click', toggleBrowserAlerts);

    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [button, drawer] });
    renderList();
    refreshBrowserStatus();
    backend.auth.onAuthStateChanged(subscribe);
  }

  function boot() {
    mount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.addEventListener('pagehide', unsubscribe);
  window.SokivaNotifications = Object.freeze({ open: openDrawer, close: closeDrawer });
})();
