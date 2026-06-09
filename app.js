/* ═══════════════════════════════════════════════════════════════
   NOVAMART — app.js
   Engineer: Google Web Design / Innovacare Software
   Architecture: Modular vanilla JS, zero dependencies
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─── 0. WAIT FOR LUCIDE + DOM ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (typeof lucide !== 'undefined') lucide.createIcons();

  // Boot all modules
  HeaderModule.init();
  HeroModule.init();
  TimerModule.init();
  ProductsModule.init();
  CartModule.init();
  SearchModule.init();
  NewsletterModule.init();
  BackToTopModule.init();
  CategoryNavModule.init();
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
    this.items = this.items.filter(i => i.id !== id);
    this.render();
  },

  changeQty(id, delta) {
    const item = this.items.find(i => i.id === id);
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
        const id     = parseInt(btn.dataset.id);
        const delta  = btn.dataset.action === 'inc' ? 1 : -1;
        this.changeQty(id, delta);
      });
    });
    this.itemsContainer.querySelectorAll('.cart-item-remove').forEach(btn => {
      btn.addEventListener('click', () => this.removeItem(parseInt(btn.dataset.id)));
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
          <img src="${product.image}" alt="${product.name}" loading="lazy" />
          ${product.badge ? `<span class="product-badge ${badgeClass}">${product.badge}</span>` : ''}
          <button class="product-wishlist" data-id="${product.id}" aria-label="Ajouter aux favoris ${product.name}" aria-pressed="false">
            <i data-lucide="heart"></i>
          </button>
        </div>
        <div class="product-body">
          <p class="product-brand">${product.brand}</p>
          <h3 class="product-name">${product.name}</h3>
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
        const id = parseInt(btn.dataset.id);
        const product = PRODUCTS.find(p => p.id === id)
                     || FLASH_PRODUCTS.find(p => p.id === id);
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