/* SOKIVA authenticated account workspace backed by Firebase. */
'use strict';

(function sokivaAccountRuntime() {
  const backend = window.SokivaFirebase;
  if (!backend?.auth || !backend?.functions) return;
  const root = document.getElementById('account-root');
  if (!root) return;

  const state = { identity: null, orders: [], addresses: [] };

  function callable(name) {
    return backend.functions.httpsCallable(name);
  }

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function toast(message, type = 'default', icon = 'info') {
    if (window.Toast?.show) Toast.show(message, type, icon, 4500);
    else window.alert(message);
  }

  function money(value) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'AED', maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    if (!value) return '—';
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai'
    }).format(date);
  }

  function statusText(status) {
    return {
      confirmed: 'Confirmée', preparing: 'En préparation', ready_for_pickup: 'Prête au retrait',
      in_transit: 'En route', delivered: 'Livrée', cancelled: 'Annulée', refunded: 'Remboursée',
      pending_cod: 'Paiement à la livraison'
    }[status] || status || 'Enregistrée';
  }

  function initials(identity) {
    const name = String(identity?.displayName || identity?.profile?.name || identity?.email || 'S K').trim();
    return name.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'SK';
  }

  function roleLabel(identity) {
    if (identity?.isSuperAdmin) return 'Super administrateur';
    return {
      admin: 'Administrateur', seller: 'Vendeur', courier: 'Livreur', customer: 'Client'
    }[identity?.role] || 'Client';
  }

  function emptyState(iconName, title, body, link) {
    const empty = create('div', 'empty-state');
    const icon = create('i'); icon.setAttribute('data-lucide', iconName);
    empty.append(icon, create('h3', '', title), create('p', '', body));
    if (link) {
      const anchor = create('a', 'btn-primary', link.label);
      anchor.href = link.href;
      empty.append(anchor);
    }
    return empty;
  }

  function profileForm() {
    const profile = state.identity.profile || {};
    const form = create('form', 'form-block identity-profile-form');
    form.id = 'identity-profile-form';

    const row = create('div', 'form-row');
    const first = create('label', 'form-field');
    first.append(create('span', '', 'Prénom'));
    const firstInput = create('input'); firstInput.name = 'firstName'; firstInput.required = true; firstInput.value = profile.firstName || '';
    first.append(firstInput);
    const last = create('label', 'form-field');
    last.append(create('span', '', 'Nom'));
    const lastInput = create('input'); lastInput.name = 'lastName'; lastInput.required = true; lastInput.value = profile.lastName || '';
    last.append(lastInput);
    row.append(first, last);

    const row2 = create('div', 'form-row');
    const emailField = create('label', 'form-field');
    emailField.append(create('span', '', 'Email'));
    const emailInput = create('input'); emailInput.type = 'email'; emailInput.value = state.identity.email || ''; emailInput.disabled = true;
    emailField.append(emailInput);
    const phoneField = create('label', 'form-field');
    phoneField.append(create('span', '', 'Téléphone UAE'));
    const phoneInput = create('input'); phoneInput.type = 'tel'; phoneInput.name = 'phone'; phoneInput.placeholder = '+971501234567'; phoneInput.value = profile.phone || '';
    phoneField.append(phoneInput);
    row2.append(emailField, phoneField);

    const languageField = create('label', 'form-field full');
    languageField.append(create('span', '', 'Langue préférée'));
    const select = create('select'); select.name = 'language';
    [['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']].forEach(([value, label]) => {
      const option = create('option', '', label); option.value = value; option.selected = (profile.language || 'fr') === value; select.append(option);
    });
    languageField.append(select);

    const submit = create('button', 'btn-primary', 'Enregistrer les modifications'); submit.type = 'submit';
    form.append(row, row2, languageField, submit);
    form.addEventListener('submit', saveProfile);
    return form;
  }

  function addressCard(address) {
    const card = create('article', 'address-card');
    if (address.isDefault) card.append(create('span', 'address-tag', 'Principale'));
    card.append(create('strong', '', address.label || 'Adresse'));
    const text = create('p');
    text.append(document.createTextNode(address.line1 || ''));
    text.append(create('br'));
    text.append(document.createTextNode([address.area, address.emirate].filter(Boolean).join(', ')));
    if (address.instructions) {
      text.append(create('br'));
      text.append(document.createTextNode(address.instructions));
    }
    card.append(text);
    if (address.phone) card.append(create('p', 'address-phone', address.phone));
    const actions = create('div', 'address-actions');
    const remove = create('button', 'btn-link danger', 'Supprimer'); remove.type = 'button';
    remove.addEventListener('click', () => {
      state.addresses = state.addresses.filter(item => item.id !== address.id);
      if (state.addresses.length && !state.addresses.some(item => item.isDefault)) state.addresses[0].isDefault = true;
      renderAddresses();
    });
    actions.append(remove);
    card.append(actions);
    return card;
  }

  function newAddressForm() {
    const form = create('form', 'address-card identity-address-form');
    form.id = 'identity-address-form';
    const fields = [
      ['label', 'Nom de l’adresse', 'Domicile'],
      ['emirate', 'Émirat', 'Abu Dhabi'],
      ['area', 'Zone / quartier', 'Khalifa City'],
      ['line1', 'Adresse complète', 'Villa, immeuble, rue'],
      ['phone', 'Téléphone UAE', '+971501234567'],
      ['instructions', 'Instructions', 'Étage, point de repère…']
    ];
    fields.forEach(([name, label, placeholder]) => {
      const field = create('label', 'form-field full');
      field.append(create('span', '', label));
      const input = create(name === 'instructions' ? 'textarea' : 'input');
      input.name = name; input.placeholder = placeholder;
      if (['emirate', 'area', 'line1'].includes(name)) input.required = true;
      field.append(input); form.append(field);
    });
    const defaultLabel = create('label', 'checkbox-label small');
    const checkbox = create('input'); checkbox.type = 'checkbox'; checkbox.name = 'isDefault';
    defaultLabel.append(checkbox, document.createTextNode(' Définir comme adresse principale'));
    const submit = create('button', 'btn-primary', 'Ajouter l’adresse'); submit.type = 'submit';
    form.append(defaultLabel, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      if (!data.emirate || !data.area || !data.line1) return toast('Complétez l’émirat, la zone et l’adresse.', 'error', 'alert-circle');
      const isDefault = form.elements.isDefault.checked || state.addresses.length === 0;
      if (isDefault) state.addresses = state.addresses.map(item => ({ ...item, isDefault: false }));
      state.addresses.push({
        id: `address-${Date.now()}`,
        label: data.label || `Adresse ${state.addresses.length + 1}`,
        emirate: data.emirate,
        area: data.area,
        line1: data.line1,
        phone: data.phone || '',
        instructions: data.instructions || '',
        isDefault
      });
      renderAddresses();
    });
    return form;
  }

  function renderOrders(container) {
    container.replaceChildren();
    if (!state.orders.length) {
      container.append(emptyState('package-open', 'Aucune commande réelle', 'Vos commandes apparaîtront ici après votre premier achat.', { href: 'shop.html', label: 'Découvrir la boutique' }));
      return;
    }
    const list = create('div', 'orders-list');
    state.orders.forEach(order => {
      const card = create('article', 'order-card');
      const info = create('div');
      info.append(create('strong', '', `#${order.id || order.orderId || 'SOKIVA'}`));
      info.append(create('p', '', `${formatDate(order.createdAt)}${order.emirate ? ` • ${order.emirate}` : ''}`));
      const status = create('span', `order-status ${order.status || ''}`, statusText(order.status));
      const total = create('strong', '', money(order.total));
      const link = create('a', 'btn-link', ['in_transit', 'delivered'].includes(order.status) ? 'Suivre' : 'Voir');
      link.href = `customer.html?order=${encodeURIComponent(order.id || order.orderId || '')}`;
      card.append(info, status, total, link);
      list.append(card);
    });
    container.append(list);
  }

  function renderAddresses() {
    const container = document.getElementById('identity-addresses-grid');
    if (!container) return;
    container.replaceChildren();
    state.addresses.forEach(address => container.append(addressCard(address)));
    container.append(newAddressForm());
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
  }

  function render() {
    root.replaceChildren();
    const identity = state.identity;
    const profile = identity.profile || {};
    const layout = create('div', 'account-layout');

    const sidebar = create('aside', 'account-sidebar');
    const user = create('div', 'account-user');
    user.append(create('div', 'account-avatar', initials(identity)));
    const userCopy = create('div');
    userCopy.append(create('strong', '', identity.displayName || identity.email || 'Compte SOKIVA'));
    userCopy.append(create('p', '', identity.email || ''));
    userCopy.append(create('span', 'identity-role-badge', roleLabel(identity)));
    user.append(userCopy);
    const tabs = create('nav', 'account-tabs');
    const tabDefinitions = [
      ['dashboard', 'layout-dashboard', 'Tableau de bord'],
      ['orders', 'package', 'Mes commandes'],
      ['addresses', 'map-pin', 'Adresses UAE'],
      ['profile', 'user', 'Profil']
    ];
    tabDefinitions.forEach(([target, iconName, label], index) => {
      const link = create('a', `account-tab${index === 0 ? ' active' : ''}`);
      link.href = `#${target}`; link.dataset.target = `panel-${target}`;
      const icon = create('i'); icon.setAttribute('data-lucide', iconName);
      link.append(icon, document.createTextNode(` ${label}`)); tabs.append(link);
    });
    const workspace = create('a', 'account-tab'); workspace.href = window.SokivaIdentityRuntime?.roleHome(identity) || 'customer.html';
    const workspaceIcon = create('i'); workspaceIcon.setAttribute('data-lucide', identity.isSuperAdmin ? 'shield-check' : 'external-link');
    workspace.append(workspaceIcon, document.createTextNode(identity.isSuperAdmin ? ' Super administration' : ' Ouvrir mon espace'));
    const logout = create('a', 'account-tab logout'); logout.href = '#'; logout.id = 'account-logout';
    const logoutIcon = create('i'); logoutIcon.setAttribute('data-lucide', 'log-out'); logout.append(logoutIcon, document.createTextNode(' Déconnexion'));
    tabs.append(workspace, logout); sidebar.append(user, tabs);

    const content = create('div', 'account-content');
    const dashboard = create('section', 'account-panel active'); dashboard.id = 'panel-dashboard';
    dashboard.append(create('h2', 'section-title', 'Tableau de bord'));
    const verification = create('div', `identity-verification ${identity.emailVerified ? 'verified' : 'pending'}`);
    verification.textContent = identity.emailVerified ? 'Email vérifié' : 'Email non vérifié';
    dashboard.append(verification);
    const stats = create('div', 'stats-row');
    [[state.orders.length, 'Commandes', 'package'], [state.addresses.length, 'Adresses', 'map-pin'], [roleLabel(identity), 'Rôle', 'badge-check']].forEach(([value, label, iconName]) => {
      const card = create('div', 'stat-card'); const icon = create('i'); icon.setAttribute('data-lucide', iconName);
      card.append(icon, create('strong', '', String(value)), create('span', '', label)); stats.append(card);
    });
    dashboard.append(stats);
    const lastHeading = create('h3', 'account-h3', 'Dernière commande'); dashboard.append(lastHeading);
    const lastContainer = create('div'); renderOrders(lastContainer); dashboard.append(lastContainer);

    const orders = create('section', 'account-panel'); orders.id = 'panel-orders';
    orders.append(create('h2', 'section-title', 'Mes commandes'));
    const ordersContainer = create('div'); renderOrders(ordersContainer); orders.append(ordersContainer);

    const addresses = create('section', 'account-panel'); addresses.id = 'panel-addresses';
    addresses.append(create('h2', 'section-title', 'Mes adresses UAE'));
    const addressGrid = create('div', 'addresses-grid'); addressGrid.id = 'identity-addresses-grid'; addresses.append(addressGrid);

    const profilePanel = create('section', 'account-panel'); profilePanel.id = 'panel-profile';
    profilePanel.append(create('h2', 'section-title', 'Mon profil'), profileForm());

    content.append(dashboard, orders, addresses, profilePanel);
    layout.append(sidebar, content); root.append(layout);

    root.querySelectorAll('.account-tab[data-target]').forEach(tab => {
      tab.addEventListener('click', event => {
        event.preventDefault();
        root.querySelectorAll('.account-tab[data-target]').forEach(item => item.classList.remove('active'));
        root.querySelectorAll('.account-panel').forEach(panel => panel.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(tab.dataset.target)?.classList.add('active');
        history.replaceState(null, '', tab.getAttribute('href'));
      });
    });
    document.getElementById('account-logout')?.addEventListener('click', async event => {
      event.preventDefault();
      await backend.auth.signOut();
      window.location.assign('login.html');
    });
    renderAddresses();
    const hash = window.location.hash.slice(1);
    if (hash) root.querySelector(`.account-tab[data-target="panel-${CSS.escape(hash)}"]`)?.click();
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
  }

  async function saveProfile(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const response = await callable('updateMyProfile')({
        firstName: form.elements.firstName.value,
        lastName: form.elements.lastName.value,
        phone: form.elements.phone.value,
        language: form.elements.language.value,
        addresses: state.addresses
      });
      state.identity = response.data;
      state.addresses = Array.isArray(response.data?.profile?.addresses) ? response.data.profile.addresses : [];
      toast('Profil mis à jour.', 'success', 'user-check');
      render();
    } catch (error) {
      toast(window.SokivaIdentityRuntime?.errorMessage(error) || error.message, 'error', 'alert-circle');
    } finally {
      button.disabled = false;
    }
  }

  async function load() {
    const user = await new Promise(resolve => {
      const unsubscribe = backend.auth.onAuthStateChanged(value => { unsubscribe(); resolve(value); });
    });
    if (!user) {
      window.location.replace(`login.html?next=${encodeURIComponent('account.html')}`);
      return;
    }
    try {
      const [identityResponse, ordersResponse] = await Promise.all([
        callable('getMyIdentity')({}),
        callable('listOrdersForRole')({ tenantId: backend.tenantId || 'lamylenoise' })
      ]);
      state.identity = identityResponse.data;
      state.orders = Array.isArray(ordersResponse.data?.orders) ? ordersResponse.data.orders : [];
      state.addresses = Array.isArray(state.identity?.profile?.addresses) ? state.identity.profile.addresses : [];
      const heroTitle = document.getElementById('account-page-title');
      if (heroTitle) heroTitle.textContent = `Bonjour ${state.identity.profile?.firstName || state.identity.displayName || ''}`.trim();
      render();
    } catch (error) {
      root.replaceChildren(emptyState('shield-alert', 'Compte indisponible', window.SokivaIdentityRuntime?.errorMessage(error) || error.message, { href: 'login.html', label: 'Revenir à la connexion' }));
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
    }
  }

  load();
})();
