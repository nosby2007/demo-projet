/* SOKIVA authenticated account workspace backed by Firebase. */
'use strict';

(function sokivaAccountRuntime() {
  const backend = window.SokivaFirebase;
  const root = document.getElementById('account-root');
  if (!root || !backend?.auth || !backend?.functions) return;

  const state = { identity: null, orders: [], addresses: [], activePanel: 'dashboard' };
  const MAX_ADDRESSES = 5;

  function callable(name) {
    return backend.functions.httpsCallable(name);
  }

  function create(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const node = create('i');
    node.setAttribute('data-lucide', name);
    return node;
  }

  function errorMessage(error) {
    return window.SokivaIdentityRuntime?.errorMessage(error)
      || String(error?.details?.message || error?.message || 'Opération impossible.').replace(/[<>]/g, '').slice(0, 320);
  }

  function toast(message, type = 'default', iconName = 'info') {
    const safe = String(message || 'Opération impossible.').replace(/[<>]/g, '').slice(0, 320);
    if (window.Toast?.show) Toast.show(safe, type, iconName, 4500);
    else window.alert(safe);
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'AED', maximumFractionDigits: 0
    }).format(Number(value || 0));
  }

  function formatDate(value) {
    const date = new Date(Number(value || 0));
    if (!value || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai'
    }).format(date);
  }

  function statusText(status) {
    return {
      confirmed: 'Confirmée', preparing: 'En préparation', ready_for_pickup: 'Prête au retrait',
      in_transit: 'En route', delivered: 'Livrée', cancelled: 'Annulée', refunded: 'Remboursée'
    }[status] || status || 'Enregistrée';
  }

  function roleLabel(identity) {
    if (identity?.isSuperAdmin) return 'Super administrateur';
    return { admin: 'Administrateur', seller: 'Vendeur', courier: 'Livreur', customer: 'Client' }[identity?.role] || 'Client';
  }

  function initials(identity) {
    const source = String(identity?.displayName || identity?.profile?.name || identity?.email || 'S K').trim();
    return source.split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'SK';
  }

  function emptyState(iconName, title, body, action) {
    const box = create('div', 'empty-state');
    box.append(icon(iconName), create('h3', '', title), create('p', '', body));
    if (action) {
      const link = create('a', 'btn-primary', action.label);
      link.href = action.href;
      box.append(link);
    }
    return box;
  }

  function setBusy(button, busy, label) {
    if (!button) return;
    if (busy) {
      button.dataset.previousText = button.textContent;
      button.disabled = true;
      button.textContent = label;
    } else {
      button.disabled = false;
      button.textContent = button.dataset.previousText || 'Enregistrer';
    }
  }

  function normalizeDefault(addresses) {
    if (!addresses.length) return [];
    let defaultIndex = addresses.findIndex(address => address.isDefault === true);
    if (defaultIndex < 0) defaultIndex = 0;
    return addresses.map((address, index) => ({ ...address, isDefault: index === defaultIndex }));
  }

  async function saveProfile(payload, button, successMessage) {
    setBusy(button, true, 'Enregistrement…');
    try {
      const response = await callable('updateMyProfile')(payload);
      state.identity = response.data;
      state.addresses = Array.isArray(response.data?.profile?.addresses) ? response.data.profile.addresses : [];
      toast(successMessage, 'success', 'circle-check');
      render();
      return true;
    } catch (error) {
      toast(errorMessage(error), 'error', 'alert-circle');
      return false;
    } finally {
      setBusy(button, false);
    }
  }

  function saveAddresses(nextAddresses, button, message) {
    return saveProfile({ addresses: normalizeDefault(nextAddresses) }, button, message);
  }

  function orderList() {
    if (!state.orders.length) {
      return emptyState('package-open', 'Aucune commande réelle', 'Vos commandes apparaîtront ici après votre premier achat.', {
        href: 'shop.html', label: 'Découvrir la boutique'
      });
    }
    const list = create('div', 'orders-list');
    state.orders.forEach(order => {
      const id = String(order.id || order.orderId || 'SOKIVA');
      const card = create('article', 'order-card');
      const info = create('div');
      info.append(create('strong', '', `#${id}`));
      info.append(create('p', '', `${formatDate(order.createdAt)}${order.emirate ? ` • ${order.emirate}` : ''}`));
      const status = create('span', `order-status ${order.status || ''}`, statusText(order.status));
      const total = create('strong', '', formatMoney(order.total));
      const link = create('a', 'btn-link', ['in_transit', 'delivered'].includes(order.status) ? 'Suivre' : 'Voir');
      link.href = `customer.html?order=${encodeURIComponent(id)}`;
      card.append(info, status, total, link);
      list.append(card);
    });
    return list;
  }

  function addressCard(address) {
    const card = create('article', 'address-card');
    if (address.isDefault) card.append(create('span', 'address-tag', 'Principale'));
    card.append(create('strong', '', address.label || 'Adresse'));
    const details = create('p');
    details.append(document.createTextNode(address.line1 || ''));
    details.append(create('br'));
    details.append(document.createTextNode([address.area, address.emirate].filter(Boolean).join(', ')));
    if (address.instructions) {
      details.append(create('br'));
      details.append(document.createTextNode(address.instructions));
    }
    card.append(details);
    if (address.phone) card.append(create('p', 'address-phone', address.phone));

    const actions = create('div', 'address-actions');
    if (!address.isDefault) {
      const makeDefault = create('button', 'btn-link', 'Définir principale');
      makeDefault.type = 'button';
      makeDefault.addEventListener('click', () => saveAddresses(
        state.addresses.map(item => ({ ...item, isDefault: item.id === address.id })),
        makeDefault,
        'Adresse principale mise à jour.'
      ));
      actions.append(makeDefault);
    }
    const remove = create('button', 'btn-link danger', 'Supprimer');
    remove.type = 'button';
    remove.addEventListener('click', () => saveAddresses(
      state.addresses.filter(item => item.id !== address.id),
      remove,
      'Adresse supprimée.'
    ));
    actions.append(remove);
    card.append(actions);
    return card;
  }

  function addressForm() {
    const form = create('form', 'address-card identity-address-form');
    const fields = [
      ['label', 'Nom de l’adresse', 'Domicile', false],
      ['emirate', 'Émirat', 'Abu Dhabi', true],
      ['area', 'Zone / quartier', 'Khalifa City', true],
      ['line1', 'Adresse complète', 'Villa, immeuble, rue', true],
      ['phone', 'Téléphone UAE', '+971501234567', false],
      ['instructions', 'Instructions', 'Étage, point de repère…', false]
    ];
    fields.forEach(([name, label, placeholder, required]) => {
      const wrapper = create('label', 'form-field full');
      wrapper.append(create('span', '', label));
      const input = create(name === 'instructions' ? 'textarea' : 'input');
      input.name = name;
      input.placeholder = placeholder;
      input.required = required;
      wrapper.append(input);
      form.append(wrapper);
    });
    const defaultLabel = create('label', 'checkbox-label small');
    const checkbox = create('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'isDefault';
    defaultLabel.append(checkbox, document.createTextNode(' Définir comme adresse principale'));
    const submit = create('button', 'btn-primary', 'Ajouter l’adresse');
    submit.type = 'submit';
    form.append(defaultLabel, submit);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (state.addresses.length >= MAX_ADDRESSES) {
        toast(`Vous pouvez enregistrer au maximum ${MAX_ADDRESSES} adresses.`, 'error', 'map-pin-off');
        return;
      }
      const data = Object.fromEntries(new FormData(form).entries());
      const isDefault = checkbox.checked || state.addresses.length === 0;
      const next = isDefault ? state.addresses.map(item => ({ ...item, isDefault: false })) : [...state.addresses];
      next.push({
        id: `address-${Date.now()}`,
        label: data.label || `Adresse ${next.length + 1}`,
        emirate: data.emirate,
        area: data.area,
        line1: data.line1,
        phone: data.phone || '',
        instructions: data.instructions || '',
        isDefault
      });
      await saveAddresses(next, submit, 'Adresse ajoutée.');
    });
    return form;
  }

  function profileForm() {
    const profile = state.identity?.profile || {};
    const form = create('form', 'form-block identity-profile-form');
    const firstRow = create('div', 'form-row');
    const firstName = create('label', 'form-field');
    firstName.append(create('span', '', 'Prénom'));
    const firstInput = create('input');
    firstInput.name = 'firstName';
    firstInput.required = true;
    firstInput.value = profile.firstName || '';
    firstName.append(firstInput);
    const lastName = create('label', 'form-field');
    lastName.append(create('span', '', 'Nom'));
    const lastInput = create('input');
    lastInput.name = 'lastName';
    lastInput.required = true;
    lastInput.value = profile.lastName || '';
    lastName.append(lastInput);
    firstRow.append(firstName, lastName);

    const secondRow = create('div', 'form-row');
    const email = create('label', 'form-field');
    email.append(create('span', '', 'Email'));
    const emailInput = create('input');
    emailInput.type = 'email';
    emailInput.disabled = true;
    emailInput.value = state.identity?.email || '';
    email.append(emailInput);
    const phone = create('label', 'form-field');
    phone.append(create('span', '', 'Téléphone UAE'));
    const phoneInput = create('input');
    phoneInput.type = 'tel';
    phoneInput.name = 'phone';
    phoneInput.placeholder = '+971501234567';
    phoneInput.value = profile.phone || '';
    phone.append(phoneInput);
    secondRow.append(email, phone);

    const language = create('label', 'form-field full');
    language.append(create('span', '', 'Langue préférée'));
    const select = create('select');
    select.name = 'language';
    [['fr', 'Français'], ['en', 'English'], ['ar', 'العربية']].forEach(([value, label]) => {
      const option = create('option', '', label);
      option.value = value;
      option.selected = (profile.language || 'fr') === value;
      select.append(option);
    });
    language.append(select);
    const submit = create('button', 'btn-primary', 'Enregistrer les modifications');
    submit.type = 'submit';
    form.append(firstRow, secondRow, language, submit);
    form.addEventListener('submit', event => {
      event.preventDefault();
      saveProfile({
        firstName: firstInput.value,
        lastName: lastInput.value,
        phone: phoneInput.value,
        language: select.value,
        addresses: state.addresses
      }, submit, 'Profil mis à jour.');
    });
    return form;
  }

  function panel(id, title) {
    const section = create('section', `account-panel${state.activePanel === id ? ' active' : ''}`);
    section.id = `panel-${id}`;
    section.append(create('h2', 'section-title', title));
    return section;
  }

  function render() {
    root.replaceChildren();
    const identity = state.identity;
    if (!identity?.profile) {
      root.append(emptyState('user-x', 'Profil SOKIVA manquant', 'Ce compte Firebase ne possède pas encore de profil applicatif valide.', {
        href: 'login.html', label: 'Revenir à la connexion'
      }));
      return;
    }

    const layout = create('div', 'account-layout');
    const sidebar = create('aside', 'account-sidebar');
    const userCard = create('div', 'account-user');
    userCard.append(create('div', 'account-avatar', initials(identity)));
    const copy = create('div');
    copy.append(create('strong', '', identity.displayName || identity.email || 'Compte SOKIVA'));
    copy.append(create('p', '', identity.email || ''));
    copy.append(create('span', 'identity-role-badge', roleLabel(identity)));
    userCard.append(copy);

    const nav = create('nav', 'account-tabs');
    const definitions = [
      ['dashboard', 'layout-dashboard', 'Tableau de bord'],
      ['orders', 'package', 'Mes commandes'],
      ['addresses', 'map-pin', 'Adresses UAE'],
      ['profile', 'user', 'Profil']
    ];
    definitions.forEach(([id, iconName, label]) => {
      const link = create('a', `account-tab${state.activePanel === id ? ' active' : ''}`);
      link.href = `#${id}`;
      link.append(icon(iconName), document.createTextNode(` ${label}`));
      link.addEventListener('click', event => {
        event.preventDefault();
        state.activePanel = id;
        history.replaceState(null, '', `#${id}`);
        render();
      });
      nav.append(link);
    });

    const workspace = create('a', 'account-tab');
    workspace.href = window.SokivaIdentityRuntime?.roleHome(identity) || 'customer.html';
    workspace.append(icon(identity.isSuperAdmin ? 'shield-check' : 'external-link'), document.createTextNode(identity.isSuperAdmin ? ' Super administration' : ' Ouvrir mon espace'));
    const logout = create('button', 'account-tab logout');
    logout.type = 'button';
    logout.append(icon('log-out'), document.createTextNode(' Déconnexion'));
    logout.addEventListener('click', async () => {
      await backend.auth.signOut();
      window.location.assign('login.html');
    });
    nav.append(workspace, logout);
    sidebar.append(userCard, nav);

    const content = create('div', 'account-content');
    const dashboard = panel('dashboard', 'Tableau de bord');
    dashboard.append(create('div', `identity-verification ${identity.emailVerified ? 'verified' : 'pending'}`, identity.emailVerified ? 'Email vérifié' : 'Email non vérifié'));
    const stats = create('div', 'stats-row');
    [[state.orders.length, 'Commandes', 'package'], [state.addresses.length, 'Adresses', 'map-pin'], [roleLabel(identity), 'Rôle', 'badge-check']].forEach(([value, label, iconName]) => {
      const card = create('div', 'stat-card');
      card.append(icon(iconName), create('strong', '', String(value)), create('span', '', label));
      stats.append(card);
    });
    dashboard.append(stats, create('h3', 'account-h3', 'Dernière commande'), orderList());

    const orders = panel('orders', 'Mes commandes');
    orders.append(orderList());

    const addresses = panel('addresses', 'Mes adresses UAE');
    const grid = create('div', 'addresses-grid');
    state.addresses.forEach(address => grid.append(addressCard(address)));
    if (state.addresses.length < MAX_ADDRESSES) grid.append(addressForm());
    addresses.append(grid);

    const profile = panel('profile', 'Mon profil');
    profile.append(profileForm());
    content.append(dashboard, orders, addresses, profile);
    layout.append(sidebar, content);
    root.append(layout);
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
  }

  async function load() {
    const user = await new Promise(resolve => {
      const unsubscribe = backend.auth.onAuthStateChanged(value => {
        unsubscribe();
        resolve(value);
      });
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
      const requestedPanel = window.location.hash.slice(1);
      if (['dashboard', 'orders', 'addresses', 'profile'].includes(requestedPanel)) state.activePanel = requestedPanel;
      const title = document.getElementById('account-page-title');
      if (title) title.textContent = `Bonjour ${state.identity.profile?.firstName || state.identity.displayName || ''}`.trim();
      render();
    } catch (error) {
      root.replaceChildren(emptyState('shield-alert', 'Compte indisponible', errorMessage(error), {
        href: 'login.html', label: 'Revenir à la connexion'
      }));
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
    }
  }

  load();
})();
