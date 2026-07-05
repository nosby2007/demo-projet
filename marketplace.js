/* Role-based marketplace workflows: seller, courier, customer and admin */
'use strict';

const MarketplaceData = {
  commission: { platform: 15, courier: 10, seller: 75 },
  localKeys: {
    requests: 'afromarket_role_requests',
    products: 'afromarket_products',
    orders: 'afromarket_orders',
    profile: 'afromarket_profile'
  },

  fb() { return window.AfroMarketFirebase || null; },
  db() { return this.fb()?.db || null; },
  auth() { return this.fb()?.auth || null; },
  ts() { return this.fb()?.timestamp || Date.now(); },

  money(n) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Number(n || 0)) + ' AED';
  },

  slug(value) {
    return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  },

  readLocal(key) {
    try { return JSON.parse(localStorage.getItem(key) || '{}'); }
    catch { return {}; }
  },

  writeLocal(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  async currentUser() {
    const auth = this.auth();
    if (!auth) return null;
    if (auth.currentUser) return auth.currentUser;
    return new Promise(resolve => {
      const off = auth.onAuthStateChanged(user => {
        off();
        resolve(user);
      });
    });
  },

  async getProfile(uid) {
    if (!uid) return null;
    const db = this.db();
    if (db) {
      const snap = await db.ref(`profiles/${uid}`).once('value');
      return snap.val();
    }
    return this.readLocal(this.localKeys.profile);
  },

  async saveProfile(uid, profile) {
    if (!uid) return;
    const payload = { ...profile, updatedAt: this.ts() };
    const db = this.db();
    if (db) return db.ref(`profiles/${uid}`).update(payload);
    this.writeLocal(this.localKeys.profile, payload);
  },

  roleHome(role) {
    return {
      admin: 'admin.html',
      seller: 'seller.html',
      courier: 'courier.html',
      customer: 'customer.html'
    }[role] || 'customer.html';
  },

  async requireRole(roles) {
    const root = document.querySelector('[data-role-page]');
    if (!root) return null;
    const wanted = Array.isArray(roles) ? roles : [root.dataset.rolePage];
    const user = await this.currentUser();
    if (!user) {
      window.location.href = `login.html?next=${encodeURIComponent(location.pathname.split('/').pop())}`;
      return null;
    }
    const profile = await this.getProfile(user.uid);
    if (!profile || !wanted.includes(profile.role)) {
      root.innerHTML = `
        <div class="empty-state role-denied">
          <i data-lucide="shield-alert"></i>
          <h3>Acces reserve</h3>
          <p>Votre compte n'a pas le role requis pour ce module.</p>
          <a href="request.html" class="btn-primary">Demander un acces</a>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
      return null;
    }
    return { user, profile };
  },

  async submitRoleRequest(data) {
    const user = await this.currentUser();
    const payload = {
      ...data,
      requesterUid: user?.uid || null,
      status: 'pending',
      createdAt: this.ts(),
      updatedAt: this.ts()
    };
    const db = this.db();
    if (db) {
      const ref = db.ref('roleRequests').push();
      await ref.set(payload);
      return ref.key;
    }
    const requests = this.readLocal(this.localKeys.requests);
    const id = `local-${Date.now()}`;
    requests[id] = payload;
    this.writeLocal(this.localKeys.requests, requests);
    return id;
  },

  normalizeProduct(product, id) {
    return {
      id: product.id || id,
      name: product.name || 'Produit africain',
      brand: product.brand || product.sellerName || 'Vendeur AFROMARKET',
      price: Number(product.price || 0),
      oldPrice: product.oldPrice ? Number(product.oldPrice) : null,
      discount: product.discount ? Number(product.discount) : null,
      rating: Number(product.rating || 4.7),
      reviews: Number(product.reviews || 0),
      image: product.image || 'https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80',
      badge: product.badge || (product.source === 'seller' ? 'Nouveau' : null),
      category: product.category || 'epicerie',
      delivery: product.delivery || 'Livraison UAE avec suivi',
      isNew: product.isNew !== false,
      sellerUid: product.sellerUid || null,
      sellerName: product.sellerName || product.brand || 'AFROMARKET'
    };
  },

  async getProducts(fallback = []) {
    const db = this.db();
    const mergeUnique = (items) => {
      const seen = new Set();
      return items.filter(item => {
        const key = String(item.id);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    if (db) {
      const snap = await db.ref('products').orderByChild('status').equalTo('active').once('value');
      const remote = [];
      snap.forEach(child => remote.push(this.normalizeProduct(child.val(), child.key)));
      return mergeUnique([...remote, ...fallback]);
    }
    const local = Object.entries(this.readLocal(this.localKeys.products))
      .map(([id, value]) => this.normalizeProduct(value, id));
    return mergeUnique([...local, ...fallback]);
  },

  async saveProduct(product) {
    const user = await this.currentUser();
    if (!user) throw new Error('Connexion requise');
    const profile = await this.getProfile(user.uid);
    const id = product.id || `seller-${user.uid}-${Date.now()}`;
    const payload = {
      ...product,
      id,
      sellerUid: user.uid,
      sellerName: profile?.businessName || profile?.name || product.brand || 'Vendeur AFROMARKET',
      status: 'active',
      source: 'seller',
      createdAt: this.ts(),
      updatedAt: this.ts()
    };
    const db = this.db();
    if (db) return db.ref(`products/${id}`).set(payload);
    const products = this.readLocal(this.localKeys.products);
    products[id] = payload;
    this.writeLocal(this.localKeys.products, products);
  },

  async seedProducts(products) {
    const db = this.db();
    const normalized = {};
    products.forEach(p => {
      normalized[`catalog-${p.id}`] = {
        ...p,
        id: `catalog-${p.id}`,
        sellerName: p.brand,
        sellerUid: 'catalog',
        status: 'active',
        source: 'catalog',
        updatedAt: this.ts()
      };
    });
    if (db) return db.ref('products').update(normalized);
    const local = this.readLocal(this.localKeys.products);
    this.writeLocal(this.localKeys.products, { ...local, ...normalized });
  },

  buildPayout(total) {
    const amount = Number(total || 0);
    return {
      platform: Math.round(amount * 0.15 * 100) / 100,
      courier: Math.round(amount * 0.10 * 100) / 100,
      seller: Math.round(amount * 0.75 * 100) / 100
    };
  },

  async createOrder(order) {
    const user = await this.currentUser();
    const total = Number(order.total || 0);
    const payload = {
      ...order,
      customerUid: user?.uid || null,
      status: 'paid',
      paymentStatus: 'paid',
      payout: this.buildPayout(total),
      createdAt: this.ts(),
      updatedAt: this.ts()
    };
    const db = this.db();
    if (db) {
      const ref = db.ref('orders').push();
      await ref.set(payload);
      return ref.key;
    }
    const orders = this.readLocal(this.localKeys.orders);
    const id = `LYN-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    orders[id] = payload;
    this.writeLocal(this.localKeys.orders, orders);
    return id;
  },

  async list(path, localKey) {
    const db = this.db();
    if (db) {
      const snap = await db.ref(path).once('value');
      const rows = [];
      snap.forEach(child => rows.push({ id: child.key, ...child.val() }));
      return rows.reverse();
    }
    return Object.entries(this.readLocal(localKey)).map(([id, value]) => ({ id, ...value })).reverse();
  },

  async update(path, id, data) {
    const db = this.db();
    if (db) return db.ref(`${path}/${id}`).update({ ...data, updatedAt: this.ts() });
    const keyByPath = {
      roleRequests: this.localKeys.requests,
      orders: this.localKeys.orders,
      products: this.localKeys.products,
      profiles: this.localKeys.profile
    };
    const key = keyByPath[path] || this.localKeys.orders;
    const rows = this.readLocal(key);
    rows[id] = { ...(rows[id] || {}), ...data, updatedAt: Date.now() };
    this.writeLocal(key, rows);
  },

  async listProfiles() {
    const db = this.db();
    if (db) {
      const snap = await db.ref('profiles').once('value');
      const rows = [];
      snap.forEach(child => rows.push({ id: child.key, uid: child.key, ...child.val() }));
      return rows.reverse();
    }
    const profile = this.readLocal(this.localKeys.profile);
    return profile?.role ? [{ id: 'local-profile', uid: 'local-profile', ...profile }] : [];
  }
};

window.MarketplaceData = MarketplaceData;

const MarketplacePages = {
  init() {
    this.initRoleRequest();
    this.initAdmin();
    this.initSeller();
    this.initCourier();
    this.initCustomer();
  },

  formData(form) {
    return Object.fromEntries(new FormData(form).entries());
  },

  initRoleRequest() {
    const form = document.getElementById('role-request-form');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = this.formData(form);
      try {
        const id = await MarketplaceData.submitRoleRequest(data);
        Toast.show(`Demande envoyee: ${id}`, 'success', 'send', 5000);
        form.reset();
      } catch (err) {
        Toast.show(err.message || 'Demande non envoyee', 'error', 'alert-circle');
      }
    });
  },

  async initAdmin() {
    const root = document.getElementById('admin-command-root');
    if (!root) return;
    const session = await MarketplaceData.requireRole('admin');
    if (!session) return;
    await this.renderAdmin(root);
  },

  async renderAdmin(root) {
    const [requests, products, orders, users] = await Promise.all([
      MarketplaceData.list('roleRequests', MarketplaceData.localKeys.requests),
      MarketplaceData.getProducts([]),
      MarketplaceData.list('orders', MarketplaceData.localKeys.orders),
      MarketplaceData.listProfiles()
    ]);

    const metrics = this.adminMetrics({ requests, products, orders, users });
    root.innerHTML = `
      <div class="admin-shell">
        <aside class="admin-sidebar" aria-label="Navigation admin">
          <div class="admin-sidebar-head">
            <span class="admin-badge">Admin</span>
            <strong>Command Center</strong>
            <small>Operations ecommerce centralisees</small>
          </div>
          <button class="admin-tab active" data-admin-tab="overview"><i data-lucide="layout-dashboard"></i> Vue globale</button>
          <button class="admin-tab" data-admin-tab="orders"><i data-lucide="receipt-text"></i> Commandes</button>
          <button class="admin-tab" data-admin-tab="payments"><i data-lucide="credit-card"></i> Paiements</button>
          <button class="admin-tab" data-admin-tab="users"><i data-lucide="users"></i> Utilisateurs</button>
          <button class="admin-tab" data-admin-tab="catalog"><i data-lucide="package-search"></i> Catalogue</button>
          <button class="admin-tab" data-admin-tab="access"><i data-lucide="shield-check"></i> Acces & roles</button>
          <button class="admin-tab" data-admin-tab="ops"><i data-lucide="activity"></i> Operations</button>
        </aside>

        <section class="admin-workspace">
          <div class="admin-toolbar">
            <div>
              <p class="eyebrow">LAMYLENOISE back office</p>
              <h2>Pilotage centralise de la marketplace</h2>
              <span>Commandes, paiements, utilisateurs, vendeurs, livreurs, catalogue et SLA.</span>
            </div>
            <div class="admin-actions">
              <button class="btn-secondary" id="admin-export"><i data-lucide="download"></i> Export JSON</button>
              <button class="btn-primary" id="seed-products"><i data-lucide="database"></i> Publier catalogue</button>
            </div>
          </div>

          <div class="role-kpis admin-kpis">
            <div class="stat-card"><i data-lucide="shopping-cart"></i><strong>${orders.length}</strong><span>Commandes totales</span></div>
            <div class="stat-card"><i data-lucide="banknote"></i><strong>${MarketplaceData.money(metrics.gmv)}</strong><span>GMV brut</span></div>
            <div class="stat-card"><i data-lucide="percent"></i><strong>${MarketplaceData.money(metrics.platformRevenue)}</strong><span>Commission plateforme</span></div>
            <div class="stat-card"><i data-lucide="alert-triangle"></i><strong>${metrics.needsAttention}</strong><span>Actions urgentes</span></div>
          </div>

          <div class="admin-panel active" data-admin-panel="overview">
            <div class="ops-grid admin-overview-grid">
              <section class="ops-panel">
                <h2>Resume temps reel</h2>
                <div class="admin-metric-list">
                  <div><span>Commandes payees</span><strong>${metrics.paidOrders}</strong></div>
                  <div><span>En preparation / transit</span><strong>${metrics.activeFulfillment}</strong></div>
                  <div><span>Livrees</span><strong>${metrics.deliveredOrders}</strong></div>
                  <div><span>Demandes en attente</span><strong>${metrics.pendingRequests}</strong></div>
                </div>
              </section>
              <section class="ops-panel">
                <h2>Repartition revenus</h2>
                <div class="payout-bars">
                  ${this.payoutBar('Plateforme', metrics.platformRevenue, metrics.gmv)}
                  ${this.payoutBar('Vendeurs', metrics.sellerRevenue, metrics.gmv)}
                  ${this.payoutBar('Livreurs', metrics.courierRevenue, metrics.gmv)}
                </div>
              </section>
            </div>
          </div>

          <div class="admin-panel" data-admin-panel="orders">
            <section class="ops-panel">
              <div class="ops-heading"><h2>Gestion des commandes</h2><span class="status-pill ${metrics.activeFulfillment ? 'pending' : 'approved'}">${metrics.activeFulfillment} actives</span></div>
              <div class="ops-table admin-table">${orders.map(o => this.adminOrderRow(o)).join('') || '<p class="muted">Aucune commande.</p>'}</div>
            </section>
          </div>

          <div class="admin-panel" data-admin-panel="payments">
            <section class="ops-panel">
              <h2>Paiements, remboursements et commissions</h2>
              <div class="ops-table admin-table">${orders.map(o => this.paymentRow(o)).join('') || '<p class="muted">Aucun paiement.</p>'}</div>
            </section>
          </div>

          <div class="admin-panel" data-admin-panel="users">
            <section class="ops-panel">
              <h2>Utilisateurs et comptes</h2>
              <div class="ops-table admin-table">${users.map(u => this.userRow(u)).join('') || '<p class="muted">Aucun profil utilisateur.</p>'}</div>
            </section>
          </div>

          <div class="admin-panel" data-admin-panel="catalog">
            <section class="ops-panel">
              <div class="ops-heading"><h2>Catalogue et vendeurs</h2><span class="muted">${products.length} produits actifs</span></div>
              <div class="ops-table admin-table">${products.map(p => this.productAdminRow(p)).join('') || '<p class="muted">Aucun produit actif.</p>'}</div>
            </section>
          </div>

          <div class="admin-panel" data-admin-panel="access">
            <section class="ops-panel">
              <h2>Demandes vendeur / livreur</h2>
              <div class="ops-table admin-table">${requests.map(r => this.requestRow(r)).join('') || '<p class="muted">Aucune demande.</p>'}</div>
            </section>
          </div>

          <div class="admin-panel" data-admin-panel="ops">
            <section class="ops-panel">
              <h2>SLA, risques et operations</h2>
              <div class="ops-table admin-table">
                ${this.opsAlert('Commandes a traiter', `${metrics.activeFulfillment} commande(s) non livree(s)`, metrics.activeFulfillment ? 'pending' : 'approved')}
                ${this.opsAlert('Paiements a verifier', `${metrics.paymentReview} paiement(s) en revue`, metrics.paymentReview ? 'pending' : 'approved')}
                ${this.opsAlert('Acces en attente', `${metrics.pendingRequests} demande(s) vendeur/livreur`, metrics.pendingRequests ? 'pending' : 'approved')}
                ${this.opsAlert('Catalogue', `${products.length} reference(s) publiee(s)`, 'approved')}
              </div>
            </section>
          </div>
        </section>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });

    this.bindAdminTabs(root);
    this.bindAdminActions(root, { requests, products, orders, users });
  },

  adminMetrics({ requests, orders, users }) {
    const gmv = orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const payout = orders.reduce((sum, order) => {
      const p = order.payout || MarketplaceData.buildPayout(order.total);
      sum.platform += Number(p.platform || 0);
      sum.courier += Number(p.courier || 0);
      sum.seller += Number(p.seller || 0);
      return sum;
    }, { platform: 0, courier: 0, seller: 0 });
    const pendingRequests = requests.filter(r => (r.status || 'pending') === 'pending').length;
    const activeFulfillment = orders.filter(o => !['delivered', 'cancelled', 'refunded'].includes(o.status || 'paid')).length;
    const paymentReview = orders.filter(o => ['pending', 'failed', 'refund_requested'].includes(o.paymentStatus || '')).length;
    return {
      gmv,
      platformRevenue: payout.platform,
      courierRevenue: payout.courier,
      sellerRevenue: payout.seller,
      paidOrders: orders.filter(o => (o.paymentStatus || 'paid') === 'paid').length,
      deliveredOrders: orders.filter(o => o.status === 'delivered').length,
      activeFulfillment,
      pendingRequests,
      paymentReview,
      users: users.length,
      needsAttention: pendingRequests + activeFulfillment + paymentReview
    };
  },

  payoutBar(label, value, total) {
    const pct = total ? Math.round((Number(value || 0) / total) * 100) : 0;
    return `<div class="payout-bar"><div><span>${label}</span><strong>${MarketplaceData.money(value)}</strong></div><progress value="${pct}" max="100"></progress><small>${pct}% du GMV</small></div>`;
  },

  bindAdminTabs(root) {
    root.querySelectorAll('[data-admin-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.adminTab;
        root.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.toggle('active', item === tab));
        root.querySelectorAll('[data-admin-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.adminPanel === target));
      });
    });
  },

  bindAdminActions(root, context) {
    root.querySelector('#seed-products')?.addEventListener('click', async () => {
      await MarketplaceData.seedProducts(window.PRODUCTS || PRODUCTS || []);
      Toast.show('Produits existants publies dans Firebase', 'success', 'database');
      this.renderAdmin(root);
    });

    root.querySelector('#admin-export')?.addEventListener('click', () => {
      const payload = JSON.stringify({ exportedAt: new Date().toISOString(), ...context }, null, 2);
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `lamylenoise-admin-export-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      Toast.show('Export admin prepare', 'success', 'download');
    });

    root.querySelectorAll('[data-approve]').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.dataset.approve;
        const request = context.requests.find(row => row.id === id) || {};
        const type = button.dataset.type;
        const role = type === 'courier' ? 'courier' : 'seller';
        const tempPassword = `Afro-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        await MarketplaceData.update('roleRequests', id, {
          status: 'approved',
          assignedRole: role,
          credentialsStatus: 'sent',
          loginInstructions: `Compte ${role} approuve. Email de la demande + mot de passe temporaire: ${tempPassword}`
        });
        if (request.requesterUid) {
          await MarketplaceData.saveProfile(request.requesterUid, {
            role,
            status: 'active',
            name: request.name || '',
            businessName: request.businessName || '',
            email: request.email || '',
            phone: request.phone || '',
            city: request.city || ''
          });
        }
        Toast.show('Statut approuve et identifiants generes', 'success', 'shield-check');
        this.renderAdmin(root);
      });
    });

    root.querySelectorAll('[data-order-status]').forEach(select => {
      select.addEventListener('change', async () => {
        await MarketplaceData.update('orders', select.dataset.orderStatus, { status: select.value });
        Toast.show('Statut commande mis a jour', 'success', 'refresh-cw');
        this.renderAdmin(root);
      });
    });

    root.querySelectorAll('[data-payment-status]').forEach(select => {
      select.addEventListener('change', async () => {
        await MarketplaceData.update('orders', select.dataset.paymentStatus, { paymentStatus: select.value });
        Toast.show('Statut paiement mis a jour', 'success', 'credit-card');
        this.renderAdmin(root);
      });
    });

    root.querySelectorAll('[data-product-status]').forEach(select => {
      select.addEventListener('change', async () => {
        await MarketplaceData.update('products', select.dataset.productStatus, { status: select.value });
        Toast.show('Produit mis a jour', 'success', 'package-check');
        this.renderAdmin(root);
      });
    });

    root.querySelectorAll('[data-user-role]').forEach(select => {
      select.addEventListener('change', async () => {
        await MarketplaceData.update('profiles', select.dataset.userRole, { role: select.value });
        Toast.show('Role utilisateur mis a jour', 'success', 'user-cog');
        this.renderAdmin(root);
      });
    });
  },

  requestRow(r) {
    return `
      <article class="ops-row admin-row">
        <div>
          <strong>${r.businessName || r.name || 'Demande'}</strong>
          <p>${r.type || 'seller'} - ${r.email || ''} - ${r.phone || ''}</p>
          <small>${r.city || ''} ${r.vehicle ? '- ' + r.vehicle : ''} ${r.loginInstructions ? '- ' + r.loginInstructions : ''}</small>
        </div>
        <span class="status-pill ${r.status || 'pending'}">${r.status || 'pending'}</span>
        <button class="btn-link" data-approve="${r.id}" data-type="${r.type || 'seller'}">Approuver</button>
      </article>`;
  },

  orderRow(o) {
    const payout = o.payout || MarketplaceData.buildPayout(o.total);
    return `
      <article class="ops-row">
        <div>
          <strong>${o.id}</strong>
          <p>${o.customerName || 'Client'} - ${o.status || 'paid'} - ${MarketplaceData.money(o.total)}</p>
          <small>Plateforme ${MarketplaceData.money(payout.platform)} | Livreur ${MarketplaceData.money(payout.courier)} | Vendeur ${MarketplaceData.money(payout.seller)}</small>
        </div>
        <span class="status-pill ${o.paymentStatus || 'paid'}">${o.paymentStatus || 'paid'}</span>
      </article>`;
  },

  adminOrderRow(o) {
    return `
      <article class="ops-row admin-row admin-row-wide">
        <div>
          <strong>${o.id}</strong>
          <p>${o.customerName || 'Client'} - ${o.phone || 'tel indisponible'} - ${o.emirate || 'UAE'}</p>
          <small>${o.address || 'Adresse a confirmer'} | ${MarketplaceData.money(o.total)} | ${o.items?.length || 0} article(s)</small>
        </div>
        <select class="admin-select" data-order-status="${o.id}">${this.statusOptions(o.status || 'paid', ['paid', 'preparing', 'ready', 'in_transit', 'delivered', 'cancelled'])}</select>
        <a class="btn-link" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address || o.emirate || 'Abu Dhabi')}">Carte</a>
      </article>`;
  },

  paymentRow(o) {
    const payout = o.payout || MarketplaceData.buildPayout(o.total);
    return `
      <article class="ops-row admin-row admin-row-wide">
        <div>
          <strong>${o.id} - ${MarketplaceData.money(o.total)}</strong>
          <p>${o.paymentMethod || 'card'} | Client: ${o.customerName || 'Client'}</p>
          <small>Plateforme ${MarketplaceData.money(payout.platform)} | Livreur ${MarketplaceData.money(payout.courier)} | Vendeur ${MarketplaceData.money(payout.seller)}</small>
        </div>
        <select class="admin-select" data-payment-status="${o.id}">${this.statusOptions(o.paymentStatus || 'paid', ['pending', 'paid', 'failed', 'refund_requested', 'refunded'])}</select>
      </article>`;
  },

  userRow(u) {
    return `
      <article class="ops-row admin-row admin-row-wide">
        <div>
          <strong>${u.businessName || u.name || u.email || u.uid}</strong>
          <p>${u.email || 'email indisponible'} - ${u.phone || 'tel indisponible'}</p>
          <small>${u.city || 'UAE'} | statut: ${u.status || 'active'} | uid: ${u.uid || u.id}</small>
        </div>
        <select class="admin-select" data-user-role="${u.uid || u.id}">${this.statusOptions(u.role || 'customer', ['customer', 'seller', 'courier', 'admin'])}</select>
      </article>`;
  },

  productAdminRow(p) {
    return `
      <article class="ops-row admin-row admin-row-wide">
        <div>
          <strong>${p.name}</strong>
          <p>${p.brand || p.sellerName || 'Vendeur'} - ${p.category || 'epicerie'} - ${MarketplaceData.money(p.price)}</p>
          <small>${p.delivery || 'Livraison UAE'} | vendeur: ${p.sellerName || p.sellerUid || 'catalogue'}</small>
        </div>
        <select class="admin-select" data-product-status="${p.id}">${this.statusOptions(p.status || 'active', ['active', 'paused', 'rejected', 'archived'])}</select>
      </article>`;
  },

  opsAlert(title, body, status) {
    return `<article class="ops-row admin-row"><div><strong>${title}</strong><p>${body}</p></div><span class="status-pill ${status}">${status === 'approved' ? 'OK' : 'A traiter'}</span></article>`;
  },

  statusOptions(current, options) {
    return options.map(option => `<option value="${option}" ${option === current ? 'selected' : ''}>${option}</option>`).join('');
  },

  async initSeller() {
    const root = document.getElementById('seller-dashboard-root');
    if (!root) return;
    const session = await MarketplaceData.requireRole('seller');
    if (!session) return;
    const products = (await MarketplaceData.getProducts([])).filter(p => p.sellerUid === session.user.uid);
    const orders = (await MarketplaceData.list('orders', MarketplaceData.localKeys.orders)).filter(o => !o.sellerUid || o.sellerUid === session.user.uid);
    root.innerHTML = `
      <div class="role-kpis">
        <div class="stat-card"><i data-lucide="store"></i><strong>${products.length}</strong><span>Produits</span></div>
        <div class="stat-card"><i data-lucide="truck"></i><strong>${orders.filter(o => o.status !== 'delivered').length}</strong><span>Livraisons</span></div>
        <div class="stat-card"><i data-lucide="users"></i><strong>${new Set(orders.map(o => o.customerUid || o.customerName)).size}</strong><span>Clients</span></div>
        <div class="stat-card"><i data-lucide="wallet"></i><strong>${MarketplaceData.money(orders.reduce((s, o) => s + Number(o.payout?.seller || 0), 0))}</strong><span>Part vendeur 75%</span></div>
      </div>
      <div class="ops-grid">
        <form class="ops-panel form-block" id="seller-product-form">
          <h2>Creer un produit ou service</h2>
          <div class="form-row">
            <label class="form-field"><span>Nom</span><input name="name" required placeholder="Pack bissap familial" /></label>
            <label class="form-field"><span>Marque / boutique</span><input name="brand" required placeholder="Ma boutique" /></label>
          </div>
          <div class="form-row">
            <label class="form-field"><span>Prix AED</span><input name="price" type="number" min="1" required /></label>
            <label class="form-field"><span>Categorie</span><select name="category"><option value="epicerie">Epicerie</option><option value="services">Services</option><option value="mode">Mode</option><option value="beaute">Beaute</option></select></label>
          </div>
          <label class="form-field full"><span>Image URL</span><input name="image" placeholder="https://..." /></label>
          <label class="form-field full"><span>Promesse livraison</span><input name="delivery" value="Livraison UAE avec suivi" /></label>
          <button class="btn-primary" type="submit"><i data-lucide="plus"></i> Publier</button>
        </form>
        <section class="ops-panel">
          <h2>Clients, livraisons et relances</h2>
          <div class="ops-table">${orders.map(o => this.orderRow(o)).join('') || '<p class="muted">Les commandes clients apparaitront ici.</p>'}</div>
        </section>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
    root.querySelector('#seller-product-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      await MarketplaceData.saveProduct(this.formData(e.currentTarget));
      Toast.show('Produit publie dans la boutique', 'success', 'package-plus');
      e.currentTarget.reset();
    });
  },

  async initCourier() {
    const root = document.getElementById('courier-dashboard-root');
    if (!root) return;
    const session = await MarketplaceData.requireRole('courier');
    if (!session) return;
    const orders = await MarketplaceData.list('orders', MarketplaceData.localKeys.orders);
    root.innerHTML = `
      <div class="role-kpis">
        <div class="stat-card"><i data-lucide="package-check"></i><strong>${orders.filter(o => o.status === 'paid').length}</strong><span>A recuperer</span></div>
        <div class="stat-card"><i data-lucide="navigation"></i><strong>${orders.filter(o => o.courierUid === session.user.uid).length}</strong><span>Mes courses</span></div>
        <div class="stat-card"><i data-lucide="wallet"></i><strong>${MarketplaceData.money(orders.reduce((s, o) => s + Number(o.payout?.courier || 0), 0))}</strong><span>Part livreur 10%</span></div>
      </div>
      <section class="ops-panel">
        <h2>Commandes, adresse client et carte</h2>
        <div class="ops-table">${orders.map(o => `
          <article class="ops-row">
            <div>
              <strong>${o.id}</strong>
              <p>${o.customerName || 'Client'} - ${o.address || 'Adresse a confirmer'}</p>
              <small>Vendeur: ${o.sellerName || 'AFROMARKET'} - Tel: ${o.phone || 'client'}</small>
            </div>
            <a class="btn-link" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address || 'Abu Dhabi')}">Map</a>
            <button class="btn-link" data-pickup="${o.id}">Recuperer</button>
          </article>`).join('') || '<p class="muted">Aucune commande disponible.</p>'}</div>
      </section>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
    root.querySelectorAll('[data-pickup]').forEach(button => {
      button.addEventListener('click', async () => {
        await MarketplaceData.update('orders', button.dataset.pickup, { courierUid: session.user.uid, status: 'in_transit' });
        Toast.show('Commande prise en charge', 'success', 'truck');
        this.initCourier();
      });
    });
  },

  async initCustomer() {
    const root = document.getElementById('customer-dashboard-root');
    if (!root) return;
    const session = await MarketplaceData.requireRole('customer');
    if (!session) return;
    const orders = (await MarketplaceData.list('orders', MarketplaceData.localKeys.orders)).filter(o => !o.customerUid || o.customerUid === session.user.uid);
    root.innerHTML = `
      <div class="role-kpis">
        <div class="stat-card"><i data-lucide="shopping-bag"></i><strong>${orders.length}</strong><span>Commandes</span></div>
        <div class="stat-card"><i data-lucide="credit-card"></i><strong>${orders.filter(o => o.paymentStatus === 'paid').length}</strong><span>Paiements effectues</span></div>
        <div class="stat-card"><i data-lucide="map"></i><strong>${orders.filter(o => o.status === 'in_transit').length}</strong><span>Livreurs en route</span></div>
      </div>
      <section class="ops-panel">
        <h2>Mes commandes et suivi livreur</h2>
        <div class="ops-table">${orders.map(o => `
          <article class="ops-row">
            <div>
              <strong>${o.id}</strong>
              <p>Vendeur: ${o.sellerName || 'AFROMARKET'} - ${MarketplaceData.money(o.total)}</p>
              <small>${o.status || 'paid'} - ${o.address || ''}</small>
            </div>
            <a class="btn-link" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address || 'Abu Dhabi')}">Voir la carte</a>
          </article>`).join('') || '<p class="muted">Aucune commande pour ce compte.</p>'}</div>
      </section>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
  }
};

document.addEventListener('DOMContentLoaded', () => MarketplacePages.init());
