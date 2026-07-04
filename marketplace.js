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
    const key = path === 'roleRequests' ? this.localKeys.requests : this.localKeys.orders;
    const rows = this.readLocal(key);
    rows[id] = { ...rows[id], ...data, updatedAt: Date.now() };
    this.writeLocal(key, rows);
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
    const [requests, products, orders] = await Promise.all([
      MarketplaceData.list('roleRequests', MarketplaceData.localKeys.requests),
      MarketplaceData.getProducts([]),
      MarketplaceData.list('orders', MarketplaceData.localKeys.orders)
    ]);
    const revenue = orders.reduce((sum, order) => sum + Number(order.payout?.platform || 0), 0);
    root.innerHTML = `
      <div class="role-kpis">
        <div class="stat-card"><i data-lucide="inbox"></i><strong>${requests.length}</strong><span>Demandes</span></div>
        <div class="stat-card"><i data-lucide="package"></i><strong>${products.length}</strong><span>Produits actifs</span></div>
        <div class="stat-card"><i data-lucide="receipt"></i><strong>${orders.length}</strong><span>Commandes</span></div>
        <div class="stat-card"><i data-lucide="percent"></i><strong>${MarketplaceData.money(revenue)}</strong><span>Commission 15%</span></div>
      </div>
      <div class="ops-grid">
        <section class="ops-panel">
          <div class="ops-heading"><h2>Demandes vendeur / livreur</h2><button class="btn-primary" id="seed-products"><i data-lucide="database"></i> Creer les produits catalogue</button></div>
          <div class="ops-table">${requests.map(r => this.requestRow(r)).join('') || '<p class="muted">Aucune demande.</p>'}</div>
        </section>
        <section class="ops-panel">
          <h2>Commandes et repartition</h2>
          <div class="ops-table">${orders.map(o => this.orderRow(o)).join('') || '<p class="muted">Aucune commande.</p>'}</div>
        </section>
      </div>`;
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });

    root.querySelector('#seed-products')?.addEventListener('click', async () => {
      await MarketplaceData.seedProducts(window.PRODUCTS || PRODUCTS || []);
      Toast.show('Produits existants publies dans Firebase', 'success', 'database');
      this.renderAdmin(root);
    });

    root.querySelectorAll('[data-approve]').forEach(button => {
      button.addEventListener('click', async () => {
        const id = button.dataset.approve;
        const request = requests.find(row => row.id === id) || {};
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
        Toast.show(`Statut approuve et identifiants generes`, 'success', 'shield-check');
        this.renderAdmin(root);
      });
    });
  },

  requestRow(r) {
    return `
      <article class="ops-row">
        <div>
          <strong>${r.businessName || r.name || 'Demande'}</strong>
          <p>${r.type || 'seller'} - ${r.email || ''} - ${r.phone || ''}</p>
          <small>${r.city || ''} ${r.vehicle ? '- ' + r.vehicle : ''}</small>
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
        <span class="status-pill paid">${o.paymentStatus || 'paid'}</span>
      </article>`;
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
