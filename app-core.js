/* ═══════════════════════════════════════════════════════════════
   LAMYLENOISE — app.js
   Épicerie africaine à Abu Dhabi · Livraison UAE
   Architecture: Modular vanilla JS, zero dependencies
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── 0. WAIT FOR LUCIDE + DOM ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // 1) First, inject shared chrome (header/footer/cart/topbar/toast/back-to-top)
  //    on pages that opt-in via <body data-shell="...">. Index doesn't opt-in
  //    because its chrome is already in markup.
  if (typeof Layout !== 'undefined') Layout.mount();

  // 2) Initialize Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // 3) Boot all modules (each module silently no-ops if its DOM root is missing)
  HeaderModule.init();
  HeroModule.init();
  TimerModule.init();
  ProductsModule.init();
  CartModule.init();
  SearchModule.init();
  NewsletterModule.init();
  BackToTopModule.init();
  CategoryNavModule.init();
  DeliveryModule.init();
  if (typeof ProductDetailModule !== 'undefined') ProductDetailModule.init();
  if (typeof ShopModule !== 'undefined')          ShopModule.init();
  if (typeof CheckoutModule !== 'undefined')      CheckoutModule.init();
  if (typeof ContactModule !== 'undefined')       ContactModule.init();
  if (typeof AccountModule !== 'undefined')       AccountModule.init();
  if (typeof AuthModule !== 'undefined')          AuthModule.init();
  EnterpriseModule.init();
});

/* ─── 1. PRODUCT DATA (Produits africains, prix en AED) ────── */
const PRODUCTS = [
  {
    id: 1, name: "Attiéké semoule de manioc précuite 1kg", brand: "AfriFood CI",
    price: 22, oldPrice: 30, discount: 27, rating: 4.8, reviews: 412,
    image: "https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=400&q=80",
    badge: "Top", category: "epicerie", delivery: "Livraison 24h Abu Dhabi",
    isNew: false
  },
  {
    id: 2, name: "Beurre de Karité brut bio 500g — Burkina Faso", brand: "KaréNature",
    price: 45, oldPrice: 65, discount: 31, rating: 4.9, reviews: 837,
    image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=400&q=80",
    badge: "Flash", category: "beaute", delivery: "Livraison gratuite dès 150 AED",
    isNew: false
  },
  {
    id: 3, name: "Tissu Wax authentique Ghana 6 yards — Multicolore", brand: "GTP Ghana",
    price: 135, oldPrice: 180, discount: 25, rating: 4.7, reviews: 256,
    image: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&q=80",
    badge: "Hot", category: "mode", delivery: "Livraison 24h UAE",
    isNew: false
  },
  {
    id: 4, name: "Huile de Palme rouge naturelle 1L — Cameroun", brand: "NaturaCm",
    price: 28, oldPrice: 38, discount: 26, rating: 4.6, reviews: 198,
    image: "https://images.unsplash.com/photo-1620577990281-d68a06fc28b6?w=400&q=80",
    badge: null, category: "epicerie", delivery: "Livraison 24h Abu Dhabi/Dubai",
    isNew: false
  },
  {
    id: 5, name: "Bissap fleurs d'hibiscus séchées 250g — Sénégal", brand: "Teranga",
    price: 18, oldPrice: 26, discount: 31, rating: 4.8, reviews: 624,
    image: "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=400&q=80",
    badge: "Flash", category: "boissons", delivery: "Livraison gratuite dès 150 AED",
    isNew: false
  },
  {
    id: 6, name: "Café Robusta moulu 500g — Côte d'Ivoire", brand: "Cafe Abidjan",
    price: 35, oldPrice: 48, discount: 27, rating: 4.7, reviews: 312,
    image: "https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&q=80",
    badge: "Top", category: "boissons", delivery: "Livraison 24h UAE",
    isNew: false
  },
  {
    id: 7, name: "Farine de Fonio bio 1kg — Mali", brand: "BioSahel",
    price: 32, oldPrice: null, discount: null, rating: 4.9, reviews: 145,
    image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80",
    badge: "Nouveau", category: "epicerie", delivery: "Livraison gratuite dès 150 AED",
    isNew: true
  },
  {
    id: 8, name: "Crème hydratante Karité & Aloe Vera 200ml", brand: "NaturaCm",
    price: 38, oldPrice: 55, discount: 31, rating: 4.5, reviews: 567,
    image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=400&q=80",
    badge: null, category: "beaute", delivery: "Livraison 48h tout UAE",
    isNew: false
  },
  {
    id: 9, name: "Savon noir africain pur 250g — Ghana", brand: "Akan Soap",
    price: 22, oldPrice: 32, discount: 31, rating: 4.7, reviews: 489,
    image: "https://images.unsplash.com/photo-1607006344380-b6775a0824a9?w=400&q=80",
    badge: "Top", category: "beaute", delivery: "Livraison 24h Abu Dhabi",
    isNew: false
  },
  {
    id: 10, name: "Gari (semoule de manioc fermenté) 1kg", brand: "AfriFood CI",
    price: 19, oldPrice: 27, discount: 30, rating: 4.6, reviews: 203,
    image: "https://images.unsplash.com/photo-1612927601601-6638404737ce?w=400&q=80",
    badge: "Flash", category: "epicerie", delivery: "Livraison 24h UAE",
    isNew: false
  },
  {
    id: 11, name: "Boubou traditionnel homme brodé — Tailles M à XXL", brand: "AfriStyle",
    price: 245, oldPrice: 340, discount: 28, rating: 4.6, reviews: 87,
    image: "https://images.unsplash.com/photo-1590735213920-68192a487bc2?w=400&q=80",
    badge: null, category: "mode", delivery: "Livraison 48h tout UAE",
    isNew: false
  },
  {
    id: 12, name: "Piment Yassa moulu 100g — Sénégal", brand: "Teranga",
    price: 14, oldPrice: 20, discount: 30, rating: 4.7, reviews: 312,
    image: "https://images.unsplash.com/photo-1599909533730-3d2dcd64c2c1?w=400&q=80",
    badge: null, category: "epices", delivery: "Livraison gratuite dès 150 AED",
    isNew: false
  },
  {
    id: 13, name: "Mortier & Pilon en bois sculpté africain 30cm", brand: "ArtisansCM",
    price: 165, oldPrice: 220, discount: 25, rating: 4.8, reviews: 56,
    image: "https://images.unsplash.com/photo-1604908815871-c6b58c7e85f4?w=400&q=80",
    badge: "Top", category: "cuisine", delivery: "Livraison 48h tout UAE",
    isNew: false
  },
  {
    id: 14, name: "Chips de plantain frites — salées 200g", brand: "PlanteSnack",
    price: 12, oldPrice: 16, discount: 25, rating: 4.5, reviews: 421,
    image: "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400&q=80",
    badge: "Flash", category: "snacks", delivery: "Livraison 24h Abu Dhabi",
    isNew: false
  },
  {
    id: 15, name: "Pur Cacao en poudre naturel 500g — Ghana", brand: "GoldenCacao",
    price: 42, oldPrice: 58, discount: 28, rating: 4.9, reviews: 178,
    image: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?w=400&q=80",
    badge: "Nouveau", category: "epicerie", delivery: "Livraison gratuite dès 150 AED",
    isNew: true
  },
  {
    id: 16, name: "Cube Maggi original — boîte de 60 cubes", brand: "Maggi",
    price: 28, oldPrice: null, discount: null, rating: 4.8, reviews: 1024,
    image: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80",
    badge: null, category: "epices", delivery: "Livraison 24h UAE",
    isNew: false
  },
  {
    id: 17, name: "Thé Touba 200g — Sénégal (girofle, poivre)", brand: "Teranga",
    price: 24, oldPrice: 34, discount: 29, rating: 4.7, reviews: 287,
    image: "https://images.unsplash.com/photo-1597318181409-cf64d0b5d8a2?w=400&q=80",
    badge: "Hot", category: "boissons", delivery: "Livraison 24h Abu Dhabi",
    isNew: false
  },
  {
    id: 18, name: "Calebasse décorative artisanale grand modèle", brand: "ArtisansCM",
    price: 95, oldPrice: 130, discount: 27, rating: 4.6, reviews: 42,
    image: "https://images.unsplash.com/photo-1604908554036-9be17b7c98c0?w=400&q=80",
    badge: null, category: "cuisine", delivery: "Livraison 48h tout UAE",
    isNew: false
  },
];

/* Flash deals (subset with extra discount) */
const FLASH_PRODUCTS = PRODUCTS.filter(p => p.badge === "Flash").map(p => ({
  ...p,
  discount: Math.min((p.discount || 0) + 15, 70)
}));
window.PRODUCTS = PRODUCTS;

/* ─── 2. UTILITIES ───────────────────────────────────────────── */
const Utils = {
  formatPrice(n) {
    return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' AED';
  },
  renderStars(rating) {
    const full  = Math.floor(rating);
    const half  = rating - full >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
  },
  clamp(val, min, max) { return Math.max(min, Math.min(max, val)); },
  debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  }
};

/* ─── 3. TOAST MODULE ────────────────────────────────────────── */
const Toast = {
  container: null,

  init() { this.container = document.getElementById('toast-container'); },

  show(message, type = 'default', icon = 'check-circle', duration = 3000) {
    if (!this.container) this.init();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<i data-lucide="${icon}"></i> ${message}`;
    this.container.appendChild(el);
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [el] });

    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, duration);
  }
};

/* ─── 4. CART MODULE ─────────────────────────────────────────── */
const CartModule = {
  items: [],
  overlay: null,
  itemsContainer: null,
  footer: null,
  totalEl: null,
  countEl: null,
  badgeEl: null,

  init() {
    this.overlay        = document.getElementById('cart-overlay');
    this.itemsContainer = document.getElementById('cart-items');
    this.footer         = document.getElementById('cart-footer');
    this.totalEl        = document.getElementById('cart-total');
    this.countEl        = document.getElementById('cart-count');
    this.badgeEl        = document.getElementById('cart-count-badge');

    document.getElementById('cart-toggle').addEventListener('click', () => this.open());
    document.getElementById('cart-close').addEventListener('click', () => this.close());
    this.overlay.addEventListener('click', e => { if (e.target === this.overlay) this.close(); });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.overlay.classList.contains('open')) this.close();
    });
  },

  open()  {
    this.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    this.overlay.focus?.();
  },
  close() {
    this.overlay.classList.remove('open');
    document.body.style.overflow = '';
  },

  addItem(product) {
    const existing = this.items.find(i => i.id === product.id);
    if (existing) {
      existing.qty++;
    } else {
      this.items.push({ ...product, qty: 1 });
    }
    this.render();
    this.animateCount();
    Toast.show(`"${product.name.slice(0, 40)}…" ajouté au panier`, 'success', 'shopping-cart');
  },

  removeItem(id) {
    this.items = this.items.filter(i => String(i.id) !== String(id));
    this.render();
  },

  changeQty(id, delta) {
    const item = this.items.find(i => String(i.id) === String(id));
    if (!item) return;
    item.qty = Utils.clamp(item.qty + delta, 1, 99);
    if (item.qty === 0) this.removeItem(id);
    else this.render();
  },

  getTotal() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },
  getCount() { return this.items.reduce((s, i) => s + i.qty, 0); },

  animateCount() {
    this.countEl.classList.remove('bump');
    void this.countEl.offsetWidth; // reflow trick
    this.countEl.classList.add('bump');
    setTimeout(() => this.countEl.classList.remove('bump'), 400);
  },

  render() {
    const count = this.getCount();
    const total = this.getTotal();

    // Update counters
    this.countEl.textContent   = count;
    this.badgeEl.textContent   = count;
    this.totalEl.textContent   = Utils.formatPrice(total);
    this.footer.style.display  = this.items.length ? 'block' : 'none';

    if (this.items.length === 0) {
      this.itemsContainer.innerHTML = `
        <div class="cart-empty">
          <i data-lucide="shopping-bag"></i>
          <p>Votre panier est vide</p>
          <span>Commencez à ajouter des articles</span>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [this.itemsContainer] });
      return;
    }

    this.itemsContainer.innerHTML = this.items.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <img class="cart-item-img" src="${item.image}" alt="${item.name}" loading="lazy" />
        <div class="cart-item-info">
          <p class="cart-item-name">${item.name}</p>
          <p class="cart-item-price">${Utils.formatPrice(item.price)}</p>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="dec" data-id="${item.id}" aria-label="Diminuer la quantité">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.id}" aria-label="Augmenter la quantité">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-id="${item.id}" aria-label="Retirer du panier">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `).join('');

    // Re-init icons
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [this.itemsContainer] });

    // Bind qty & remove actions
    this.itemsContainer.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id     = btn.dataset.id;
        const delta  = btn.dataset.action === 'inc' ? 1 : -1;
        this.changeQty(id, delta);
      });
    });
    this.itemsContainer.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => this.removeItem(btn.dataset.id));
    });
  }
};

/* ─── 5. PRODUCT CARD RENDERER ───────────────────────────────── */
const CardRenderer = {
  render(product, inScroll = false) {
    const hasDiscount = product.discount && product.oldPrice;
    const badgeClass = {
      'Flash':   '',
      'Nouveau': 'new',
      'Top':     'top',
      'Hot':     'hot'
    }[product.badge] || '';

    return `
      <article class="product-card" role="listitem" data-id="${product.id}" data-cat="${product.category}">
        <div class="product-img-wrap">
          <a href="product.html?id=${product.id}" class="product-img-link" aria-label="Voir ${product.name}">
            <img src="${product.image}" alt="${product.name}" loading="lazy" />
          </a>
          ${product.badge ? `<span class="product-badge ${badgeClass}">${product.badge}</span>` : ''}
          <button class="product-wishlist" data-id="${product.id}" aria-label="Ajouter aux favoris ${product.name}" aria-pressed="false">
            <i data-lucide="heart"></i>
          </button>
        </div>
        <div class="product-body">
          <p class="product-brand">${product.brand}</p>
          <h3 class="product-name"><a href="product.html?id=${product.id}">${product.name}</a></h3>
          <div class="product-rating">
            <span class="stars" aria-label="${product.rating} sur 5">${Utils.renderStars(product.rating)}</span>
            <span class="review-count">(${product.reviews.toLocaleString('fr-FR')})</span>
          </div>
          <div class="product-price-row">
            <span class="price-current">${Utils.formatPrice(product.price)}</span>
            ${hasDiscount ? `<span class="price-old">${Utils.formatPrice(product.oldPrice)}</span>` : ''}
            ${hasDiscount ? `<span class="price-discount">-${product.discount}%</span>` : ''}
          </div>
          <p class="product-delivery">✓ ${product.delivery}</p>
        </div>
        <div class="product-footer">
          <button class="btn-add-cart" data-id="${product.id}" aria-label="Ajouter ${product.name} au panier">
            <i data-lucide="shopping-cart"></i>
            Ajouter au panier
          </button>
        </div>
      </article>
    `;
  },

  bindCardEvents(container) {
    // Add to cart buttons
    container.querySelectorAll('.btn-add-cart').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.id;
        const source = window.MarketplaceCatalog || PRODUCTS;
        const product = source.find(p => String(p.id) === String(id))
                     || PRODUCTS.find(p => String(p.id) === String(id))
                     || FLASH_PRODUCTS.find(p => String(p.id) === String(id));
        if (product) CartModule.addItem(product);
      });
    });

    // Wishlist buttons
    container.querySelectorAll('.product-wishlist').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const active = btn.classList.toggle('active');
        btn.setAttribute('aria-pressed', String(active));
        const name = btn.closest('.product-card').querySelector('.product-name')?.textContent;
        Toast.show(
          active ? 'Ajouté aux favoris ❤️' : 'Retiré des favoris',
          active ? 'success' : 'default',
          active ? 'heart' : 'heart-off'
        );
      });
    });
  }
};

/* ─── 6. FLASH PRODUCTS MODULE ───────────────────────────────── */
const FlashModule = {
  init() {
    const container = document.getElementById('flash-products');
    if (!container) return;

    // Clear skeletons
    container.innerHTML = '';

    FLASH_PRODUCTS.forEach(product => {
      const tmp = document.createElement('div');
      tmp.innerHTML = CardRenderer.render(product, true);
      const card = tmp.firstElementChild;
      container.appendChild(card);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
    CardRenderer.bindCardEvents(container);
  }
};

/* ─── 7. PRODUCTS GRID MODULE ────────────────────────────────── */
const ProductsModule = {
  grid:      null,
  all:       [...PRODUCTS],
  filtered:  [...PRODUCTS],
  page:      1,
  perPage:   8,
  sortVal:   'default',
  view:      'grid',

  init() {
    this.grid = document.getElementById('products-grid');
    if (!this.grid) return;  // not on this page

    // Sort
    document.getElementById('sort-select').addEventListener('change', e => {
      this.sortVal = e.target.value;
      this.page = 1;
      this.applyFiltersAndSort();
    });

    // View toggle
    document.getElementById('view-grid').addEventListener('click', () => this.setView('grid'));
    document.getElementById('view-list').addEventListener('click', () => this.setView('list'));

    // Pagination
    document.getElementById('page-prev').addEventListener('click', () => this.goToPage(this.page - 1));
    document.getElementById('page-next').addEventListener('click', () => this.goToPage(this.page + 1));

    // Sidebar reset
    document.getElementById('reset-filters').addEventListener('click', () => this.resetFilters());

    // Price range
    document.getElementById('price-range').addEventListener('input', Utils.debounce(e => {
      document.getElementById('price-max').value = e.target.value;
      this.applyFiltersAndSort();
    }, 200));

    // Initial render
    this.applyFiltersAndSort();
    FlashModule.init();
  },

  setView(mode) {
    this.view = mode;
    this.grid.classList.toggle('list-view', mode === 'list');
    document.getElementById('view-grid').classList.toggle('active', mode === 'grid');
    document.getElementById('view-list').classList.toggle('active', mode === 'list');
    document.getElementById('view-grid').setAttribute('aria-pressed', String(mode === 'grid'));
    document.getElementById('view-list').setAttribute('aria-pressed', String(mode === 'list'));
  },

  applyFiltersAndSort() {
    let data = [...this.all];

    // Sort
    const sorters = {
      'price-asc':  (a, b) => a.price - b.price,
      'price-desc': (a, b) => b.price - a.price,
      'rating':     (a, b) => b.rating - a.rating,
      'new':        (a, b) => Number(b.isNew) - Number(a.isNew),
      'default':    () => 0
    };
    data.sort(sorters[this.sortVal] || sorters.default);

    // Price filter
    const maxPrice = parseInt(document.getElementById('price-max').value) || 999999999;
    const minPrice = parseInt(document.getElementById('price-min').value) || 0;
    if (maxPrice) data = data.filter(p => p.price >= minPrice && p.price <= maxPrice);

    this.filtered = data;
    this.page = Utils.clamp(this.page, 1, this.totalPages());
    this.render();
    this.renderPagination();
  },

  totalPages() { return Math.max(1, Math.ceil(this.filtered.length / this.perPage)); },

  currentPageItems() {
    const start = (this.page - 1) * this.perPage;
    return this.filtered.slice(start, start + this.perPage);
  },

  render() {
    const items = this.currentPageItems();
    this.grid.innerHTML = items.map(p => CardRenderer.render(p)).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [this.grid] });
    CardRenderer.bindCardEvents(this.grid);

    // Scroll into view on page change (smooth)
    if (this.page > 1) {
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  renderPagination() {
    const total       = this.totalPages();
    const pagesEl     = document.getElementById('page-numbers');
    const prevBtn     = document.getElementById('page-prev');
    const nextBtn     = document.getElementById('page-next');

    prevBtn.disabled = this.page === 1;
    nextBtn.disabled = this.page === total;

    // Build page numbers: show current +/- 1, plus first and last
    const pages = new Set([1, total, this.page, this.page - 1, this.page + 1]);
    const sorted = [...pages].filter(p => p >= 1 && p <= total).sort((a, b) => a - b);

    let html = '';
    let prev = 0;
    sorted.forEach(p => {
      if (prev && p - prev > 1) html += `<span class="page-num" style="border:none;background:none;color:var(--color-text-muted)">…</span>`;
      html += `<button class="page-num ${p === this.page ? 'active' : ''}" data-page="${p}" aria-current="${p === this.page ? 'page' : 'false'}" aria-label="Page ${p}">${p}</button>`;
      prev = p;
    });

    pagesEl.innerHTML = html;
    pagesEl.querySelectorAll('.page-num[data-page]').forEach(btn => {
      btn.addEventListener('click', () => this.goToPage(parseInt(btn.dataset.page)));
    });
  },

  goToPage(p) {
    this.page = Utils.clamp(p, 1, this.totalPages());
    this.render();
    this.renderPagination();
  },

  resetFilters() {
    document.getElementById('price-min').value   = '';
    document.getElementById('price-max').value   = '';
    document.getElementById('price-range').value = 1500;
    document.querySelectorAll('#sidebar input[type="checkbox"]').forEach(cb => {
      cb.checked = cb.value === 'tous';
    });
    document.getElementById('sort-select').value = 'default';
    this.sortVal = 'default';
    this.page    = 1;
    this.applyFiltersAndSort();
    Toast.show('Filtres réinitialisés', 'default', 'filter-x');
  }
};

/* ─── 8. COUNTDOWN TIMER MODULE ──────────────────────────────── */
const TimerModule = {
  endTime: null,

  init() {
    // 4 hours 23 minutes from now
    this.endTime = Date.now() + (4 * 3600 + 23 * 60 + 47) * 1000;
    this.tick();
    setInterval(() => this.tick(), 1000);
  },

  tick() {
    const remaining = Math.max(0, this.endTime - Date.now());
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);

    const pad = n => String(n).padStart(2, '0');
    const hEl = document.getElementById('timer-h');
    const mEl = document.getElementById('timer-m');
    const sEl = document.getElementById('timer-s');

    if (hEl) hEl.textContent = pad(h);
    if (mEl) mEl.textContent = pad(m);
    if (sEl) sEl.textContent = pad(s);
  }
};

/* ─── 9. HERO SLIDER MODULE ──────────────────────────────────── */
const HeroModule = {
  slides:   null,
  dots:     null,
  current:  0,
  total:    0,
  interval: null,
  DELAY:    5000,

  init() {
    this.slides   = document.querySelectorAll('.hero-slide');
    this.dots     = document.querySelectorAll('.hero-dot');
    this.total    = this.slides.length;

    if (this.total < 2) return;

    document.getElementById('hero-prev').addEventListener('click', () => {
      this.goTo((this.current - 1 + this.total) % this.total);
      this.resetAuto();
    });
    document.getElementById('hero-next').addEventListener('click', () => {
      this.goTo((this.current + 1) % this.total);
      this.resetAuto();
    });

    this.dots.forEach(dot => {
      dot.addEventListener('click', () => {
        this.goTo(parseInt(dot.dataset.slide));
        this.resetAuto();
      });
    });

    // Pause on hover
    const hero = document.querySelector('.hero');
    hero?.addEventListener('mouseenter', () => clearInterval(this.interval));
    hero?.addEventListener('mouseleave', () => this.startAuto());

    // Touch swipe support
    let startX = 0;
    hero?.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    hero?.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dx) > 50) {
        this.goTo(dx < 0
          ? (this.current + 1) % this.total
          : (this.current - 1 + this.total) % this.total
        );
        this.resetAuto();
      }
    });

    this.startAuto();
  },

  goTo(index) {
    this.slides[this.current].classList.remove('active');
    this.dots[this.current]?.classList.remove('active');
    this.dots[this.current]?.setAttribute('aria-selected', 'false');

    this.current = index;

    this.slides[this.current].classList.add('active');
    this.dots[this.current]?.classList.add('active');
    this.dots[this.current]?.setAttribute('aria-selected', 'true');

    if (typeof lucide !== 'undefined') lucide.createIcons();
  },

  startAuto() {
    this.interval = setInterval(() => {
      this.goTo((this.current + 1) % this.total);
    }, this.DELAY);
  },

  resetAuto() {
    clearInterval(this.interval);
    this.startAuto();
  }
};

/* ─── 10. HEADER MODULE ──────────────────────────────────────── */
const HeaderModule = {
  header:    null,
  hamburger: null,
  mobileNav: null,

  init() {
    this.header    = document.getElementById('site-header');
    this.hamburger = document.getElementById('hamburger');
    this.mobileNav = document.getElementById('mobile-nav');

    // Hamburger toggle
    this.hamburger.addEventListener('click', () => {
      const open = this.hamburger.classList.toggle('open');
      this.mobileNav.classList.toggle('open', open);
      this.mobileNav.setAttribute('aria-hidden', String(!open));
      this.hamburger.setAttribute('aria-expanded', String(open));
    });

    // Sticky scroll effect
    window.addEventListener('scroll', Utils.debounce(() => {
      this.header.classList.toggle('scrolled', window.scrollY > 10);
    }, 50), { passive: true });
  }
};

/* ─── 11. CATEGORY NAV MODULE ────────────────────────────────── */
const CategoryNavModule = {
  init() {
    const items = document.querySelectorAll('.cat-item');

    items.forEach(item => {
      item.addEventListener('click', () => {
        items.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const cat = item.dataset.cat;
        // Filter products grid
        if (cat === 'tous') {
          ProductsModule.all = [...PRODUCTS];
        } else {
          ProductsModule.all = PRODUCTS.filter(p => p.category === cat);
        }
        ProductsModule.page = 1;
        ProductsModule.applyFiltersAndSort();

        // Scroll to products
        document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }
};

/* ─── 12. SEARCH MODULE ──────────────────────────────────────── */
const SearchModule = {
  input:       null,
  suggestions: null,
  SUGGESTIONS: [
    "Attiéké", "Beurre de Karité", "Tissu Wax", "Bissap hibiscus",
    "Café Robusta", "Fonio bio", "Huile de palme", "Savon noir",
    "Gari", "Boubou", "Piment Yassa", "Cacao Ghana", "Cube Maggi",
    "Chips plantain", "Thé Touba", "Mortier pilon", "Calebasse"
  ],

  init() {
    this.input       = document.getElementById('search-input');
    this.suggestions = document.getElementById('search-suggestions');

    this.input.addEventListener('input', Utils.debounce(() => this.updateSuggestions(), 200));
    this.input.addEventListener('focus', () => this.updateSuggestions());
    this.input.addEventListener('keydown', e => {
      if (e.key === 'Escape') this.hideSuggestions();
      if (e.key === 'Enter')  { this.performSearch(); this.hideSuggestions(); }
    });

    document.querySelector('.search-btn')?.addEventListener('click', () => this.performSearch());
    document.addEventListener('click', e => {
      if (!e.target.closest('.search-wrapper')) this.hideSuggestions();
    });
  },

  updateSuggestions() {
    const q = this.input.value.trim().toLowerCase();
    if (!q) { this.hideSuggestions(); return; }

    const matches = this.SUGGESTIONS
      .filter(s => s.toLowerCase().includes(q))
      .slice(0, 6);

    if (!matches.length) { this.hideSuggestions(); return; }

    this.suggestions.innerHTML = matches.map(s => `
      <div class="suggestion-item" role="option" tabindex="0">
        <i data-lucide="search"></i>
        <span>${s.replace(new RegExp(`(${q})`, 'gi'), '<strong>$1</strong>')}</span>
      </div>
    `).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [this.suggestions] });

    this.suggestions.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const text = item.querySelector('span').textContent;
        this.input.value = text;
        this.hideSuggestions();
        this.performSearch(text);
      });
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter') item.click();
      });
    });

    this.suggestions.classList.add('open');
  },

  hideSuggestions() { this.suggestions.classList.remove('open'); },

  performSearch(query) {
    const q = (query || this.input.value).trim().toLowerCase();
    if (!q) return;

    const results = PRODUCTS.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );

    ProductsModule.all  = results;
    ProductsModule.page = 1;
    ProductsModule.applyFiltersAndSort();

    document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    Toast.show(
      results.length
        ? `${results.length} résultat${results.length > 1 ? 's' : ''} pour "${q}"`
        : `Aucun résultat pour "${q}"`,
      results.length ? 'default' : 'error',
      results.length ? 'search' : 'search-x'
    );
  }
};

/* ─── 13. NEWSLETTER MODULE ──────────────────────────────────── */
const NewsletterModule = {
  init() {
    const form = document.getElementById('newsletter-form');
    if (!form) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const email = document.getElementById('newsletter-email');
      const val   = email.value.trim();

      if (!val || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        email.style.border = '2px solid red';
        Toast.show('Veuillez entrer une adresse email valide', 'error', 'alert-circle');
        return;
      }

      email.style.border = '';
      email.value = '';
      Toast.show('Inscription réussie ! Bienvenue 🎉', 'success', 'mail-check', 4000);
    });
  }
};

/* ─── 14. BACK TO TOP MODULE ─────────────────────────────────── */
const BackToTopModule = {
  btn: null,

  init() {
    this.btn = document.getElementById('back-to-top');
    if (!this.btn) return;

    window.addEventListener('scroll', Utils.debounce(() => {
      this.btn.classList.toggle('visible', window.scrollY > 400);
    }, 100), { passive: true });

    this.btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
};

/* ─── 15. DELIVERY RESERVATION MODULE (UAE) ──────────────────── */
const DeliveryModule = {
  init() {
    const form = document.getElementById('delivery-form');
    if (!form) return;

    // Default date = tomorrow
    const dateInput = document.getElementById('deliv-date');
    if (dateInput) {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      dateInput.min   = tomorrow.toISOString().split('T')[0];
      dateInput.value = tomorrow.toISOString().split('T')[0];
    }

    form.addEventListener('submit', e => {
      e.preventDefault();

      const fields = {
        name:    document.getElementById('deliv-name').value.trim(),
        phone:   document.getElementById('deliv-phone').value.trim(),
        emirate: document.getElementById('deliv-emirate').value,
        area:    document.getElementById('deliv-area').value.trim(),
        address: document.getElementById('deliv-address').value.trim(),
        date:    document.getElementById('deliv-date').value,
        slot:    document.getElementById('deliv-slot').value,
      };

      // Validation
      const missing = Object.entries(fields).filter(([_, v]) => !v).map(([k]) => k);
      if (missing.length) {
        Toast.show('Veuillez remplir tous les champs obligatoires', 'error', 'alert-circle');
        return;
      }

      if (!/^[+\d\s()-]{8,}$/.test(fields.phone)) {
        Toast.show('Numéro de téléphone UAE invalide', 'error', 'alert-circle');
        return;
      }

      // Success
      Toast.show(
        `✅ Livraison réservée à ${fields.emirate} le ${fields.date} (${fields.slot})`,
        'success',
        'check-circle',
        5000
      );
      form.reset();

      // Re-init date to tomorrow
      if (dateInput) {
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
        dateInput.value = tomorrow.toISOString().split('T')[0];
      }
    });
  }
};

/* ─── 16. LAYOUT MODULE — Shared chrome for sub-pages ───────── */
const Layout = {
  // Pages opt-in via <body data-shell="full">.
  // index.html already has its chrome inline → does NOT opt-in.
  mount() {
    const body = document.body;
    if (!body || body.dataset.shell !== 'full') return;

    const active = body.dataset.page || '';
    const main   = body.querySelector('main');

    const chromeBefore = `
      <!-- TOAST -->
      <div id="toast-container" aria-live="polite" aria-atomic="true"></div>

      <!-- CART DRAWER -->
      <div id="cart-overlay" class="cart-overlay" role="dialog" aria-modal="true" aria-label="Panier d'achat">
        <div class="cart-drawer">
          <div class="cart-header">
            <h2>Mon Panier <span id="cart-count-badge" class="cart-badge">0</span></h2>
            <button id="cart-close" class="icon-btn" aria-label="Fermer le panier">
              <i data-lucide="x"></i>
            </button>
          </div>
          <div id="cart-items" class="cart-items">
            <div class="cart-empty">
              <i data-lucide="shopping-bag"></i>
              <p>Votre panier est vide</p>
              <span>Découvrez nos saveurs d'Afrique</span>
            </div>
          </div>
          <div class="cart-footer" id="cart-footer" style="display:none;">
            <div class="cart-subtotal">
              <span>Sous-total</span>
              <strong id="cart-total">0 AED</strong>
            </div>
            <a href="checkout.html" class="btn-checkout" style="text-decoration:none;display:flex;align-items:center;justify-content:center;gap:.5rem;">
              <i data-lucide="credit-card"></i>
              Commander • Livraison UAE
            </a>
            <p class="cart-disclaimer">Livraison gratuite à partir de 150 AED dans tout l'UAE</p>
          </div>
        </div>
      </div>

      <!-- TOPBAR -->
      <div class="topbar">
        <div class="container topbar-inner">
          <span>🚚 Livraison express dans tout l'UAE — <strong>Abu Dhabi • Dubai • Sharjah • Ajman</strong></span>
          <div class="topbar-links">
            <a href="delivery.html">Suivre ma livraison</a>
            <a href="contact.html">WhatsApp +971 50 000 0000</a>
            <a href="request.html">Vendre / Livrer</a>
          </div>
        </div>
      </div>

      <!-- HEADER -->
      <header class="site-header" id="site-header">
        <div class="container header-inner">
          <a href="index.html" class="logo" aria-label="LAMYLENOISE — Accueil">
            <span class="logo-nova">LAMYLENOISE</span>
            <span class="logo-dot">●</span>
          </a>

          <div class="search-wrapper" role="search">
            <div class="search-category">
              <select id="search-category" aria-label="Catégorie de recherche">
                <option>Tout</option>
                <option>Épicerie</option>
                <option>Boissons</option>
                <option>Épices</option>
                <option>Mode Wax</option>
                <option>Beauté Karité</option>
                <option>Cuisine</option>
              </select>
              <i data-lucide="chevron-down"></i>
            </div>
            <input type="search" id="search-input" placeholder="Rechercher attiéké, karité, wax, bissap…" autocomplete="off" aria-label="Rechercher" />
            <button class="search-btn" aria-label="Lancer la recherche"><i data-lucide="search"></i></button>
            <div id="search-suggestions" class="search-suggestions" role="listbox"></div>
          </div>

          <nav class="header-actions" aria-label="Actions principales">
            <a class="icon-btn header-action" href="account.html#wishlist" aria-label="Favoris">
              <i data-lucide="heart"></i><span class="action-label">Favoris</span>
            </a>
            <a class="icon-btn header-action" href="account.html" aria-label="Mon compte">
              <i data-lucide="user"></i><span class="action-label">Compte</span>
            </a>
            <button class="icon-btn header-action cart-toggle" id="cart-toggle" aria-label="Panier">
              <i data-lucide="shopping-cart"></i>
              <span id="cart-count" class="cart-count">0</span>
              <span class="action-label">Panier</span>
            </button>
          </nav>

          <button class="hamburger" id="hamburger" aria-label="Menu" aria-expanded="false" aria-controls="mobile-nav">
            <span></span><span></span><span></span>
          </button>
        </div>

        <nav class="cat-nav" aria-label="Navigation principale">
          <div class="container cat-nav-inner">
            ${Layout._navLink('index.html',     'home',            'Accueil',        active)}
            ${Layout._navLink('shop.html',      'layout-grid',     'Boutique',       active)}
            ${Layout._navLink('shop.html?cat=epicerie', 'shopping-basket', 'Épicerie', active)}
            ${Layout._navLink('shop.html?cat=boissons', 'coffee',  'Boissons',       active)}
            ${Layout._navLink('shop.html?cat=epices',   'flame',   'Épices',         active)}
            ${Layout._navLink('shop.html?cat=mode',     'shirt',   'Mode Wax',       active)}
            ${Layout._navLink('shop.html?cat=beaute',   'sparkles','Beauté',         active)}
            ${Layout._navLink('blog.html',     'book-open',        'Recettes',       active)}
            ${Layout._navLink('delivery.html', 'truck',            'Livraison',      active)}
            ${Layout._navLink('request.html',  'badge-check',      'Vendeur/Livreur',active)}
            ${Layout._navLink('customer.html', 'user-round',        'Client',         active)}
            ${Layout._navLink('about.html',    'info',             'À propos',       active)}
            ${Layout._navLink('contact.html',  'phone',            'Contact',        active)}
          </div>
        </nav>

        <div class="mobile-nav" id="mobile-nav" aria-hidden="true">
          <div class="mobile-nav-inner">
            <a href="account.html"    class="mobile-link"><i data-lucide="user"></i> Mon Compte</a>
            <a href="account.html#wishlist" class="mobile-link"><i data-lucide="heart"></i> Mes Favoris</a>
            <a href="account.html#orders" class="mobile-link"><i data-lucide="package"></i> Mes Commandes</a>
            <a href="customer.html"   class="mobile-link"><i data-lucide="user-round"></i> Espace client</a>
            <a href="seller.html"     class="mobile-link"><i data-lucide="store"></i> Espace vendeur</a>
            <a href="courier.html"    class="mobile-link"><i data-lucide="truck"></i> Espace livreur</a>
            <a href="admin.html"      class="mobile-link"><i data-lucide="shield"></i> Admin</a>
            <a href="request.html"    class="mobile-link"><i data-lucide="badge-check"></i> Demande d'acces</a>
            <a href="delivery.html"   class="mobile-link"><i data-lucide="truck"></i> Réserver livraison</a>
            <hr class="mobile-divider"/>
            <a href="shop.html"       class="mobile-link"><i data-lucide="layout-grid"></i> Boutique complète</a>
            <a href="blog.html"       class="mobile-link"><i data-lucide="book-open"></i> Recettes & blog</a>
            <a href="about.html"      class="mobile-link"><i data-lucide="info"></i> À propos</a>
            <a href="faq.html"        class="mobile-link"><i data-lucide="help-circle"></i> FAQ</a>
            <a href="contact.html"    class="mobile-link"><i data-lucide="phone"></i> Contact</a>
          </div>
        </div>
      </header>
    `;

    const chromeAfter = `
      <!-- FOOTER -->
      <footer class="site-footer" role="contentinfo">
        <div class="container">
          <div class="footer-grid">
            <div class="footer-brand">
              <a href="index.html" class="logo footer-logo">
                <span class="logo-nova">LAMYLENOISE</span><span class="logo-dot">●</span>
              </a>
              <p>L'épicerie africaine de référence à Abu Dhabi. Plus de 800 produits authentiques importés du continent, livrés dans tous les Émirats.</p>
              <div class="social-links">
                <a href="#" aria-label="Facebook"><i data-lucide="facebook"></i></a>
                <a href="#" aria-label="Instagram"><i data-lucide="instagram"></i></a>
                <a href="#" aria-label="TikTok"><i data-lucide="music-2"></i></a>
                <a href="contact.html" aria-label="WhatsApp"><i data-lucide="message-circle"></i></a>
              </div>
            </div>
            <div class="footer-col">
              <h3>Acheter</h3>
              <ul>
                <li><a href="account.html">Mon compte</a></li>
                <li><a href="account.html#orders">Mes commandes</a></li>
                <li><a href="shop.html">Catalogue complet</a></li>
                <li><a href="delivery.html">Réserver livraison</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h3>Aide & Support</h3>
              <ul>
                <li><a href="faq.html">FAQ</a></li>
                <li><a href="contact.html">Contactez-nous</a></li>
                <li><a href="delivery.html">Zones de livraison UAE</a></li>
                <li><a href="contact.html">WhatsApp +971 50 000 0000</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h3>À propos</h3>
              <ul>
                <li><a href="about.html">Qui sommes-nous</a></li>
                <li><a href="request.html">Vendre sur LAMYLENOISE</a></li>
                <li><a href="request.html">Devenir livreur UAE</a></li>
                <li><a href="admin.html">Command center admin</a></li>
                <li><a href="blog.html">Blog & Recettes</a></li>
              </ul>
            </div>
            <div class="footer-col">
              <h3>Paiements acceptés</h3>
              <div class="payment-icons">
                <span class="payment-badge">Visa</span>
                <span class="payment-badge">MasterCard</span>
                <span class="payment-badge">Apple Pay</span>
                <span class="payment-badge">Tabby</span>
                <span class="payment-badge">Tamara</span>
                <span class="payment-badge">COD</span>
              </div>
            </div>
          </div>
          <div class="footer-bottom">
            <p>© 2026 LAMYLENOISE LLC — Abu Dhabi, UAE. Tous droits réservés.</p>
            <div class="footer-legal">
              <a href="legal.html#privacy">Confidentialité</a>
              <a href="legal.html#terms">CGV</a>
              <a href="legal.html#cookies">Cookies</a>
            </div>
          </div>
        </div>
      </footer>

      <button class="back-to-top" id="back-to-top" aria-label="Retour en haut">
        <i data-lucide="arrow-up"></i>
      </button>
    `;

    // Inject before and after <main>
    if (main) {
      main.insertAdjacentHTML('beforebegin', chromeBefore);
      main.insertAdjacentHTML('afterend',  chromeAfter);
    } else {
      body.insertAdjacentHTML('afterbegin', chromeBefore);
      body.insertAdjacentHTML('beforeend',  chromeAfter);
    }
  },

  _navLink(href, icon, label, activePage) {
    // Match by file name (without query)
    const hrefFile = href.split('?')[0];
    const isActive = activePage && (activePage === hrefFile || activePage === href);
    return `
      <a href="${href}" class="cat-item ${isActive ? 'active' : ''}">
        <i data-lucide="${icon}"></i> ${label}
      </a>
    `;
  }
};



/* ─── 16B. ENTERPRISE MODULE — PWA, telemetry, trust signals ─── */
const EnterpriseModule = {
  init() {
    this.registerServiceWorker();
    this.captureWebVitals();
    this.renderTrustBanner();
  },

  registerServiceWorker() {
    if (!('serviceWorker' in navigator) || window.location.protocol === 'file:') return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/service-worker.js')
        .then(() => console.info('[LAMYLENOISE] Offline shell registered'))
        .catch(error => console.warn('[LAMYLENOISE] Service worker unavailable', error));
    });
  },

  captureWebVitals() {
    if (!('PerformanceObserver' in window)) return;
    const metrics = {};
    const report = (name, value) => {
      metrics[name] = Math.round(value);
      window.dispatchEvent(new CustomEvent('lamylenoise:metric', { detail: { name, value: metrics[name] } }));
    };

    try {
      new PerformanceObserver(list => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) report('LCP', last.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });

      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) report('CLS', (metrics.CLS || 0) + entry.value * 1000);
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (_) {
      // Older browsers can safely ignore PerformanceObserver options.
    }
  },

  renderTrustBanner() {
    const main = document.querySelector('main');
    if (!main || document.querySelector('.enterprise-trust-strip')) return;
    const strip = document.createElement('section');
    strip.className = 'enterprise-trust-strip';
    strip.setAttribute('aria-label', 'Garanties entreprise');
    strip.innerHTML = `
      <div class="container enterprise-trust-grid">
        <div><strong>99,9% disponibilité</strong><span>Hébergement Firebase + cache offline</span></div>
        <div><strong>RBAC marketplace</strong><span>Espaces client, vendeur, livreur et admin</span></div>
        <div><strong>Conformité UAE</strong><span>CGV, confidentialité, cookies et traçabilité</span></div>
        <div><strong>SLA livraison</strong><span>Promesse 24h Abu Dhabi/Dubai avec suivi</span></div>
      </div>`;
    main.insertAdjacentElement('afterbegin', strip);
  }
};

/* ─── 17. SHOP MODULE — full catalogue page ─────────────────── */
const ShopModule = {
  async init() {
    const grid = document.getElementById('shop-grid');
    if (!grid) return;

    // Read ?cat= and ?q= from URL
    const params = new URLSearchParams(window.location.search);
    const cat    = params.get('cat');
    const q      = (params.get('q') || '').toLowerCase();

    let items = window.MarketplaceData
      ? await window.MarketplaceData.getProducts(PRODUCTS)
      : [...PRODUCTS];
    window.MarketplaceCatalog = items;
    if (cat) items = items.filter(p => p.category === cat);
    if (q)   items = items.filter(p =>
      p.name.toLowerCase().includes(q)  ||
      p.brand.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );

    // Categories filter
    const cats = ['tous','epicerie','boissons','epices','mode','beaute','cuisine','snacks'];
    const labels = {
      tous: 'Tout', epicerie: 'Épicerie', boissons: 'Boissons', epices: 'Épices',
      mode: 'Mode Wax', beaute: 'Beauté', cuisine: 'Cuisine', snacks: 'Snacks'
    };
    const chips = document.getElementById('shop-chips');
    if (chips) {
      chips.innerHTML = cats.map(c => {
        const active = (c === 'tous' && !cat) || c === cat;
        const href = c === 'tous' ? 'shop.html' : `shop.html?cat=${c}`;
        return `<a href="${href}" class="shop-chip ${active ? 'active' : ''}">${labels[c]}</a>`;
      }).join('');
    }

    // Counter
    const counter = document.getElementById('shop-count');
    if (counter) counter.textContent = `${items.length} produit${items.length > 1 ? 's' : ''}`;

    // Render
    if (items.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i data-lucide="package-x"></i>
          <h3>Aucun produit trouvé</h3>
          <p>Essayez d'élargir vos filtres ou <a href="shop.html">voir tout le catalogue</a>.</p>
        </div>`;
    } else {
      grid.innerHTML = items.map(p => CardRenderer.render(p)).join('');
      CardRenderer.bindCardEvents(grid);
    }
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [grid] });

    // Sort
    const sortSel = document.getElementById('shop-sort');
    if (sortSel) {
      sortSel.addEventListener('change', () => {
        const sorters = {
          'price-asc':  (a,b) => a.price - b.price,
          'price-desc': (a,b) => b.price - a.price,
          'rating':     (a,b) => b.rating - a.rating,
          'new':        (a,b) => Number(b.isNew) - Number(a.isNew),
          'default':    () => 0
        };
        items.sort(sorters[sortSel.value] || sorters.default);
        grid.innerHTML = items.map(p => CardRenderer.render(p)).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [grid] });
        CardRenderer.bindCardEvents(grid);
      });
    }
  }
};

/* ─── 18. PRODUCT DETAIL MODULE ──────────────────────────────── */
const ProductDetailModule = {
  init() {
    const root = document.getElementById('product-detail');
    if (!root) return;

    const id = parseInt(new URLSearchParams(window.location.search).get('id'), 10);
    const product = PRODUCTS.find(p => p.id === id);

    if (!product) {
      root.innerHTML = `
        <div class="empty-state">
          <i data-lucide="package-x"></i>
          <h3>Produit introuvable</h3>
          <p><a href="shop.html">Retour au catalogue</a></p>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
      return;
    }

    document.title = `${product.name} — LAMYLENOISE`;

    const hasDiscount = product.discount && product.oldPrice;
    const related = PRODUCTS.filter(p => p.category === product.category && p.id !== product.id).slice(0, 4);

    root.innerHTML = `
      <nav class="breadcrumb" aria-label="Fil d'Ariane">
        <a href="index.html">Accueil</a> ›
        <a href="shop.html">Boutique</a> ›
        <a href="shop.html?cat=${product.category}">${product.category}</a> ›
        <span>${product.name}</span>
      </nav>

      <div class="pd-grid">
        <div class="pd-gallery">
          <div class="pd-main-img">
            <img src="${product.image}" alt="${product.name}" />
            ${product.badge ? `<span class="product-badge ${product.badge.toLowerCase()}">${product.badge}</span>` : ''}
          </div>
          <div class="pd-thumbs">
            <button class="pd-thumb active"><img src="${product.image}" alt="" /></button>
            <button class="pd-thumb"><img src="${product.image}&blur=40" alt="" /></button>
            <button class="pd-thumb"><img src="${product.image}&sat=-100" alt="" /></button>
          </div>
        </div>

        <div class="pd-info">
          <p class="pd-brand">${product.brand}</p>
          <h1 class="pd-title">${product.name}</h1>
          <div class="product-rating" style="margin:0 0 1rem;">
            <span class="stars">${Utils.renderStars(product.rating)}</span>
            <span class="review-count">(${product.reviews.toLocaleString('fr-FR')} avis)</span>
          </div>

          <div class="pd-price-row">
            <span class="price-current pd-price">${Utils.formatPrice(product.price)}</span>
            ${hasDiscount ? `<span class="price-old">${Utils.formatPrice(product.oldPrice)}</span>` : ''}
            ${hasDiscount ? `<span class="price-discount">-${product.discount}%</span>` : ''}
          </div>

          <p class="pd-delivery"><i data-lucide="truck"></i> ${product.delivery}</p>

          <div class="pd-desc">
            <h3>Description</h3>
            <p>Produit authentique importé directement d'Afrique de l'Ouest. Sélectionné par nos équipes pour sa qualité et son origine garantie. Livré dans tout l'UAE avec respect de la chaîne du froid si nécessaire.</p>
            <ul>
              <li><i data-lucide="check"></i> 100% authentique, origine garantie</li>
              <li><i data-lucide="check"></i> Livraison express 24h Abu Dhabi & Dubai</li>
              <li><i data-lucide="check"></i> Paiement à la livraison disponible</li>
              <li><i data-lucide="check"></i> Échange & remboursement sous 14 jours</li>
            </ul>
          </div>

          <div class="pd-qty-row">
            <div class="pd-qty">
              <button id="pd-dec" aria-label="Diminuer">−</button>
              <span id="pd-qty-val">1</span>
              <button id="pd-inc" aria-label="Augmenter">+</button>
            </div>
            <button class="btn-primary pd-add" id="pd-add">
              <i data-lucide="shopping-cart"></i> Ajouter au panier
            </button>
            <a href="checkout.html" class="btn-ghost-dark pd-buy" id="pd-buy">
              <i data-lucide="zap"></i> Acheter maintenant
            </a>
          </div>
        </div>
      </div>

      ${related.length ? `
        <section class="pd-related">
          <h2 class="section-title">Produits similaires</h2>
          <div class="products-scroll" id="related-scroll" role="list">
            ${related.map(p => CardRenderer.render(p)).join('')}
          </div>
        </section>
      ` : ''}
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
    CardRenderer.bindCardEvents(root);

    // Quantity
    let qty = 1;
    const qtyEl = document.getElementById('pd-qty-val');
    document.getElementById('pd-dec').addEventListener('click', () => { qty = Math.max(1, qty - 1); qtyEl.textContent = qty; });
    document.getElementById('pd-inc').addEventListener('click', () => { qty = Math.min(99, qty + 1); qtyEl.textContent = qty; });

    // Add to cart with selected qty
    document.getElementById('pd-add').addEventListener('click', () => {
      for (let i = 0; i < qty; i++) CartModule.addItem(product);
    });
    document.getElementById('pd-buy').addEventListener('click', () => {
      for (let i = 0; i < qty; i++) CartModule.addItem(product);
    });

    // Thumb switcher
    root.querySelectorAll('.pd-thumb').forEach(t => {
      t.addEventListener('click', () => {
        root.querySelectorAll('.pd-thumb').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        const img = root.querySelector('.pd-main-img img');
        if (img) img.src = t.querySelector('img').src;
      });
    });
  }
};

/* ─── 19. CHECKOUT MODULE ────────────────────────────────────── */
const CheckoutModule = {
  init() {
    const root = document.getElementById('checkout-root');
    if (!root) return;

    const itemsEl = document.getElementById('co-items');
    const subEl   = document.getElementById('co-subtotal');
    const shipEl  = document.getElementById('co-shipping');
    const totEl   = document.getElementById('co-total');
    const form    = document.getElementById('checkout-form');

    const SHIP_BY_EMIRATE = {
      'Abu Dhabi':       0,  'Dubai':         15, 'Sharjah':       20,
      'Ajman':          25,  'Al Ain':        30, 'Ras Al Khaimah':35,
      'Fujairah':       35,  'Umm Al Quwain': 35
    };

    const render = () => {
      // Items
      if (CartModule.items.length === 0) {
        itemsEl.innerHTML = `
          <div class="empty-state" style="padding:2rem">
            <i data-lucide="shopping-bag"></i>
            <h3>Votre panier est vide</h3>
            <p><a href="shop.html" class="btn-primary">Découvrir la boutique</a></p>
          </div>`;
      } else {
        itemsEl.innerHTML = CartModule.items.map(it => `
          <div class="co-item">
            <img src="${it.image}" alt="${it.name}" />
            <div class="co-item-info">
              <p class="co-item-name">${it.name}</p>
              <p class="co-item-brand">${it.brand}</p>
            </div>
            <div class="co-item-qty">×${it.qty}</div>
            <div class="co-item-price">${Utils.formatPrice(it.price * it.qty)}</div>
          </div>
        `).join('');
      }

      // Totals
      const subtotal = CartModule.getTotal();
      const emirate  = document.getElementById('co-emirate')?.value;
      const shipping = subtotal >= 150 ? 0 : (SHIP_BY_EMIRATE[emirate] || 0);
      const total    = subtotal + shipping;

      subEl.textContent  = Utils.formatPrice(subtotal);
      shipEl.textContent = shipping === 0 ? 'GRATUITE' : Utils.formatPrice(shipping);
      totEl.textContent  = Utils.formatPrice(total);

      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [itemsEl] });
    };

    render();
    document.getElementById('co-emirate')?.addEventListener('change', render);

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      if (CartModule.items.length === 0) {
        Toast.show('Votre panier est vide', 'error', 'alert-circle');
        return;
      }
      const user = window.MarketplaceData ? await MarketplaceData.currentUser() : null;
      if (window.AfroMarketFirebase && !user) {
        Toast.show('Connectez-vous avant de confirmer la commande', 'error', 'log-in');
        setTimeout(() => { window.location.href = 'login.html?next=checkout.html'; }, 900);
        return;
      }

      const required = [...form.querySelectorAll('[required]')];
      if (required.some(field => !field.value.trim())) {
        Toast.show('Veuillez remplir toutes les informations de commande', 'error', 'alert-circle');
        return;
      }

      const subtotal = CartModule.getTotal();
      const emirate  = document.getElementById('co-emirate')?.value;
      const shipping = subtotal >= 150 ? 0 : (SHIP_BY_EMIRATE[emirate] || 0);
      const total    = subtotal + shipping;
      const firstItem = CartModule.items[0] || {};
      const inputs = form.querySelectorAll('input');
      const customerName = `${inputs[0]?.value || ''} ${inputs[1]?.value || ''}`.trim();
      const address = [...form.querySelectorAll('input')]
        .slice(4, 6)
        .map(input => input.value)
        .filter(Boolean)
        .join(', ');

      try {
        const orderId = window.MarketplaceData
          ? await MarketplaceData.createOrder({
              customerName,
              email: form.querySelector('input[type=email]')?.value || '',
              phone: form.querySelector('input[type=tel]')?.value || '',
              emirate,
              address,
              items: CartModule.items,
              subtotal,
              shipping,
              total,
              sellerUid: firstItem.sellerUid || 'catalog',
              sellerName: firstItem.sellerName || firstItem.brand || 'AFROMARKET',
              paymentMethod: form.querySelector('input[name=pay]:checked')?.value || 'card'
            })
          : 'LYN-' + Math.random().toString(36).slice(2, 8).toUpperCase();

        Toast.show(`Commande ${orderId} confirmee`, 'success', 'check-circle', 5000);
        CartModule.items = [];
        CartModule.render();
        setTimeout(() => { window.location.href = `customer.html?order=${orderId}`; }, 1500);
      } catch (err) {
        Toast.show(err.message || 'Commande non enregistree', 'error', 'alert-circle');
      }
    });
  }
};

/* ─── 20. CONTACT MODULE ─────────────────────────────────────── */
const ContactModule = {
  init() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', e => {
      e.preventDefault();
      const name  = document.getElementById('ct-name').value.trim();
      const email = document.getElementById('ct-email').value.trim();
      const msg   = document.getElementById('ct-msg').value.trim();

      if (!name || !email || !msg) {
        Toast.show('Veuillez remplir tous les champs', 'error', 'alert-circle');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        Toast.show('Email invalide', 'error', 'alert-circle');
        return;
      }
      Toast.show('Message envoyé ! Nous répondons sous 24h.', 'success', 'mail-check', 4000);
      form.reset();
    });
  }
};

/* ─── 21. ACCOUNT MODULE (demo, no real auth) ────────────────── */
const AccountModule = {
  init() {
    const root = document.getElementById('account-root');
    if (!root) return;

    // Tab nav
    root.querySelectorAll('.account-tab').forEach(tab => {
      tab.addEventListener('click', e => {
        e.preventDefault();
        const target = tab.dataset.target;
        root.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
        root.querySelectorAll('.account-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        root.querySelector(`#${target}`)?.classList.add('active');
        history.replaceState(null, '', `#${target.replace('panel-', '')}`);
      });
    });

    // Open tab from hash
    const hash = window.location.hash.slice(1);
    if (hash) {
      const tab = root.querySelector(`.account-tab[data-target="panel-${hash}"]`);
      if (tab) tab.click();
    }

    // Logout
    root.querySelector('#account-logout')?.addEventListener('click', async () => {
      if (window.AfroMarketFirebase) await AfroMarketFirebase.auth.signOut();
      Toast.show('Déconnecté avec succès', 'success', 'log-out');
      setTimeout(() => { window.location.href = 'login.html'; }, 800);
    });
  }
};

/* ─── 22. AUTH MODULE (login / register, demo) ───────────────── */
const AuthModule = {
  init() {
    const login = document.getElementById('login-form');
    const reg   = document.getElementById('register-form');

    login?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = login.querySelector('input[type=email]').value.trim();
      const pwd   = login.querySelector('input[type=password]').value;
      if (!email || !pwd) {
        Toast.show('Email et mot de passe requis', 'error', 'alert-circle');
        return;
      }
      try {
        if (window.AfroMarketFirebase) {
          const credential = await AfroMarketFirebase.auth.signInWithEmailAndPassword(email, pwd);
          const profile = await MarketplaceData.getProfile(credential.user.uid);
          const next = new URLSearchParams(window.location.search).get('next');
          Toast.show('Connexion reussie', 'success', 'log-in');
          setTimeout(() => {
            window.location.href = next || MarketplaceData.roleHome(profile?.role || 'customer');
          }, 800);
          return;
        }
        Toast.show('Connexion réussie', 'success', 'log-in');
        setTimeout(() => { window.location.href = 'account.html'; }, 800);
      } catch (err) {
        Toast.show(err.message || 'Connexion impossible', 'error', 'alert-circle');
      }
    });

    reg?.addEventListener('submit', async e => {
      e.preventDefault();
      const inputs = reg.querySelectorAll('input[required]');
      for (const i of inputs) {
        if (!i.value.trim()) {
          Toast.show('Veuillez remplir tous les champs', 'error', 'alert-circle');
          return;
        }
      }
      try {
        if (window.AfroMarketFirebase) {
          const firstName = reg.querySelectorAll('input[type=text]')[0]?.value.trim() || '';
          const lastName = reg.querySelectorAll('input[type=text]')[1]?.value.trim() || '';
          const email = reg.querySelector('input[type=email]')?.value.trim();
          const phone = reg.querySelector('input[type=tel]')?.value.trim();
          const password = reg.querySelector('input[type=password]')?.value;
          const credential = await AfroMarketFirebase.auth.createUserWithEmailAndPassword(email, password);
          await credential.user.updateProfile({ displayName: `${firstName} ${lastName}`.trim() });
          await MarketplaceData.saveProfile(credential.user.uid, {
            role: 'customer',
            status: 'active',
            name: `${firstName} ${lastName}`.trim(),
            firstName,
            lastName,
            email,
            phone
          });
          Toast.show('Compte client cree', 'success', 'user-check');
          setTimeout(() => { window.location.href = 'customer.html'; }, 1000);
          return;
        }
        Toast.show('Compte créé. Bienvenue !', 'success', 'user-check');
        setTimeout(() => { window.location.href = 'account.html'; }, 1000);
      } catch (err) {
        Toast.show(err.message || 'Creation du compte impossible', 'error', 'alert-circle');
      }
    });
  }
};
