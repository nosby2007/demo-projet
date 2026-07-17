/* Trusted SaaS runtime: moves sensitive marketplace actions out of the browser. */
'use strict';

(function secureMarketplaceRuntime() {
  if (!window.MarketplaceData) {
    console.error('MarketplaceData must load before saas-runtime.js');
    return;
  }

  const TENANT_ID = 'lamylenoise';
  const original = {
    list: MarketplaceData.list.bind(MarketplaceData),
    update: MarketplaceData.update.bind(MarketplaceData),
    getProducts: MarketplaceData.getProducts.bind(MarketplaceData),
    seedProducts: MarketplaceData.seedProducts.bind(MarketplaceData),
    submitRoleRequest: MarketplaceData.submitRoleRequest.bind(MarketplaceData)
  };

  function callable(name) {
    const functions = window.AfroMarketFirebase?.functions;
    if (!functions) {
      throw new Error('Le service sécurisé est indisponible. Rechargez la page ou contactez le support.');
    }
    return functions.httpsCallable(name);
  }

  function messageFrom(error, fallback) {
    const raw = error?.details?.message || error?.message || fallback;
    return String(raw).replace(/^FirebaseError:\s*/i, '');
  }

  function productId(item) {
    const raw = String(item?.productId || item?.id || '').trim();
    return /^\d+$/.test(raw) ? `catalog-${raw}` : raw;
  }

  function normalizeRoleRecord(record) {
    if (record?.sellerPayout != null && !record.payout) {
      return { ...record, payout: { seller: Number(record.sellerPayout || 0) } };
    }
    if (record?.courierPayout != null && !record.payout) {
      return { ...record, payout: { courier: Number(record.courierPayout || 0) } };
    }
    return record;
  }

  function normalizeRoleProduct(product) {
    return {
      ...MarketplaceData.normalizeProduct(product, product.id),
      ...product,
      id: product.id
    };
  }

  MarketplaceData.submitRoleRequest = async function submitEmploymentApplication(data) {
    const user = await MarketplaceData.currentUser();
    if (!user) throw new Error('Créez un compte client ou connectez-vous avant d’envoyer votre candidature.');
    return original.submitRoleRequest({
      ...data,
      tenantId: TENANT_ID,
      requesterUid: user.uid
    });
  };

  MarketplaceData.createOrder = async function createSecureOrder(order) {
    try {
      const response = await callable('createOrderDraft')({
        tenantId: order.tenantId || TENANT_ID,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        emirate: order.emirate,
        address: order.address,
        deliveryDate: order.deliveryDate,
        deliverySlot: order.deliverySlot,
        paymentMethod: order.paymentMethod,
        items: (order.items || []).map(item => ({
          productId: productId(item),
          quantity: Number(item.qty || item.quantity || 1)
        }))
      });
      if (response.data?.deliveryCode) {
        sessionStorage.setItem(`delivery-code:${response.data.orderId}`, response.data.deliveryCode);
      }
      return response.data.orderId;
    } catch (error) {
      throw new Error(messageFrom(error, 'La commande sécurisée n’a pas pu être créée.'));
    }
  };

  MarketplaceData.list = async function listSecure(path, localKey) {
    if (path !== 'orders') return original.list(path, localKey);
    try {
      const response = await callable('listOrdersForRole')({ tenantId: TENANT_ID });
      const orders = Array.isArray(response.data?.orders) ? response.data.orders : [];
      return orders.map(normalizeRoleRecord);
    } catch (error) {
      throw new Error(messageFrom(error, 'Impossible de charger les commandes autorisées.'));
    }
  };

  MarketplaceData.update = async function updateSecure(path, id, data) {
    if (path === 'orders') {
      try {
        const isCourierClaim = data?.status === 'in_transit' && Boolean(data?.courierUid);
        const response = isCourierClaim
          ? await callable('claimDeliveryJob')({ tenantId: TENANT_ID, orderId: id })
          : await callable('transitionOrder')({ tenantId: TENANT_ID, orderId: id, status: data?.status });
        return response.data;
      } catch (error) {
        throw new Error(messageFrom(error, 'Le statut de la commande n’a pas été modifié.'));
      }
    }

    if (path === 'roleRequests' && data?.status === 'approved') {
      try {
        const response = await callable('approveRoleRequest')({
          tenantId: TENANT_ID,
          requestId: id,
          role: data.assignedRole
        });
        return response.data;
      } catch (error) {
        throw new Error(messageFrom(error, 'La candidature n’a pas pu être approuvée.'));
      }
    }

    return original.update(path, id, data);
  };

  MarketplaceData.getProducts = async function getProductsByContext(fallback = []) {
    const rolePage = document.querySelector('[data-role-page]')?.dataset.rolePage;
    if (!['admin', 'seller'].includes(rolePage)) return original.getProducts(fallback);
    try {
      const response = await callable('listProductsForRole')({ tenantId: TENANT_ID });
      return (response.data?.products || []).map(normalizeRoleProduct);
    } catch (error) {
      throw new Error(messageFrom(error, 'Impossible de charger les produits de votre espace.'));
    }
  };

  MarketplaceData.saveProduct = async function submitProductForReview(product) {
    try {
      const response = await callable('submitProduct')({
        tenantId: TENANT_ID,
        name: product.name,
        sku: product.sku,
        brand: product.brand,
        price: Number(product.price),
        category: product.category,
        stockAvailable: Number(product.stockAvailable || 0),
        image: product.image,
        delivery: product.delivery
      });
      return response.data;
    } catch (error) {
      throw new Error(messageFrom(error, 'Le produit n’a pas pu être soumis.'));
    }
  };

  MarketplaceData.seedProducts = async function seedCatalog(products) {
    try {
      const response = await callable('seedCatalogProducts')({ tenantId: TENANT_ID, products });
      return response.data;
    } catch (error) {
      throw new Error(messageFrom(error, 'Le catalogue n’a pas pu être importé.'));
    }
  };

  MarketplaceData.reviewProduct = async function reviewProduct(id, decision) {
    try {
      const response = await callable('reviewProduct')({
        tenantId: TENANT_ID,
        productId: id,
        decision
      });
      return response.data;
    } catch (error) {
      throw new Error(messageFrom(error, 'Le produit n’a pas pu être révisé.'));
    }
  };

  MarketplaceData.updateInventory = async function updateInventory(id, stockAvailable) {
    try {
      const response = await callable('updateInventory')({
        tenantId: TENANT_ID,
        productId: id,
        stockAvailable: Number(stockAvailable)
      });
      return response.data;
    } catch (error) {
      throw new Error(messageFrom(error, 'Le stock n’a pas pu être modifié.'));
    }
  };

  MarketplaceData.completeDelivery = async function completeDelivery(id, deliveryCode) {
    try {
      const response = await callable('completeDelivery')({
        tenantId: TENANT_ID,
        orderId: id,
        deliveryCode
      });
      return response.data;
    } catch (error) {
      throw new Error(messageFrom(error, 'La livraison n’a pas pu être confirmée.'));
    }
  };

  if (typeof MarketplacePages !== 'undefined') {
    const originalStatusText = MarketplacePages.statusText.bind(MarketplacePages);
    MarketplacePages.statusText = function statusText(status) {
      return {
        pending_review: 'À vérifier',
        rejected: 'Rejeté',
        confirmed: 'Confirmée',
        preparing: 'En préparation',
        ready_for_pickup: 'Prête au retrait',
        pending_cod: 'Paiement à collecter',
        in_transit: 'En livraison',
        delivered: 'Livrée',
        cancelled: 'Annulée'
      }[status] || originalStatusText(status);
    };

    MarketplacePages.productRow = function secureProductRow(product) {
      const status = product.status || 'pending_review';
      const stock = product.inventoryTracked === false ? 'Service / non suivi' : `${Number(product.stockAvailable || 0)} disponible(s)`;
      return `
        <article class="admin-record compact">
          <div>
            <strong>${this.escape(product.name)}</strong>
            <p>${this.escape(product.sellerName || product.brand)} - ${this.escape(product.category)}</p>
            <small>${this.escape(stock)} · ${this.escape(product.sku || product.id)}</small>
          </div>
          <span class="status-pill ${status}">${this.statusText(status)}</span>
          <strong class="record-price">${MarketplaceData.money(product.price)}</strong>
          ${status === 'pending_review' ? `
            <div class="record-actions">
              <button class="btn-link" data-product-review="approve" data-product-id="${this.escape(product.id)}">Activer</button>
              <button class="btn-link danger" data-product-review="reject" data-product-id="${this.escape(product.id)}">Rejeter</button>
            </div>` : ''}
        </article>`;
    };

    const originalRenderAdmin = MarketplacePages.renderAdmin.bind(MarketplacePages);
    MarketplacePages.renderAdmin = async function secureRenderAdmin(root) {
      await originalRenderAdmin(root);
      root.querySelectorAll('[data-product-review]').forEach(button => {
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await MarketplaceData.reviewProduct(button.dataset.productId, button.dataset.productReview);
            Toast.show(button.dataset.productReview === 'approve' ? 'Produit activé' : 'Produit rejeté', 'success', 'badge-check');
            await this.renderAdmin(root);
          } catch (error) {
            button.disabled = false;
            Toast.show(error.message, 'error', 'alert-circle');
          }
        });
      });
    };

    MarketplacePages.orderRow = function secureOrderRow(order, withActions = false) {
      const payout = order.payout || MarketplaceData.buildPayout(order.total);
      const status = order.status || 'confirmed';
      const canCancel = !['in_transit', 'delivered', 'cancelled'].includes(status);
      return `
        <article class="admin-record">
          <div>
            <strong>${this.escape(order.id)}</strong>
            <p>${this.escape(order.customerName || 'Client')} - ${this.escape(order.emirate || '')} - ${MarketplaceData.money(order.total)}</p>
            <small>${this.escape(order.address || 'Adresse protégée')} · ${Object.keys(order.sellerUids || {}).length || 1} vendeur(s)</small>
          </div>
          <span class="status-pill ${status}">${this.statusText(status)}</span>
          <small class="record-money">P ${MarketplaceData.money(payout.platform)} | L ${MarketplaceData.money(payout.courier)} | V ${MarketplaceData.money(payout.seller)}</small>
          ${withActions && canCancel ? `
            <div class="record-actions">
              <button class="btn-link danger" data-order-id="${this.escape(order.id)}" data-order-status="cancelled">Annuler</button>
            </div>` : ''}
        </article>`;
    };

    MarketplacePages.initSeller = async function secureSellerDashboard() {
      const root = document.getElementById('seller-dashboard-root');
      if (!root) return;
      const session = await MarketplaceData.requireRole('seller');
      if (!session) return;
      const [products, orders] = await Promise.all([
        MarketplaceData.getProducts([]),
        MarketplaceData.list('orders', MarketplaceData.localKeys.orders)
      ]);
      const earnings = orders.reduce((sum, order) => sum + Number(order.payout?.seller || 0), 0);
      root.innerHTML = `
        <div class="role-kpis">
          <div class="stat-card"><i data-lucide="store"></i><strong>${products.length}</strong><span>Produits soumis</span></div>
          <div class="stat-card"><i data-lucide="package-check"></i><strong>${orders.filter(order => ['confirmed','preparing'].includes(order.status)).length}</strong><span>À préparer</span></div>
          <div class="stat-card"><i data-lucide="badge-check"></i><strong>${products.filter(product => product.status === 'active').length}</strong><span>Produits actifs</span></div>
          <div class="stat-card"><i data-lucide="wallet"></i><strong>${MarketplaceData.money(earnings)}</strong><span>Gains attribués</span></div>
        </div>
        <div class="ops-grid">
          <form class="ops-panel form-block" id="seller-product-form">
            <h2>Soumettre un produit ou service</h2>
            <div class="form-row">
              <label class="form-field"><span>Nom</span><input name="name" required placeholder="Pack bissap familial" /></label>
              <label class="form-field"><span>Marque / boutique</span><input name="brand" required placeholder="Ma boutique" /></label>
            </div>
            <div class="form-row">
              <label class="form-field"><span>Prix AED</span><input name="price" type="number" min="1" step="0.01" required /></label>
              <label class="form-field"><span>Stock initial</span><input name="stockAvailable" type="number" min="0" value="0" required /></label>
            </div>
            <div class="form-row">
              <label class="form-field"><span>SKU</span><input name="sku" placeholder="BIS-001" /></label>
              <label class="form-field"><span>Catégorie</span><select name="category"><option value="epicerie">Épicerie</option><option value="services">Services</option><option value="mode">Mode</option><option value="beaute">Beauté</option><option value="boissons">Boissons</option></select></label>
            </div>
            <label class="form-field full"><span>Image URL</span><input name="image" placeholder="https://..." /></label>
            <label class="form-field full"><span>Promesse livraison</span><input name="delivery" value="Livraison UAE avec suivi" /></label>
            <button class="btn-primary" type="submit"><i data-lucide="send"></i> Soumettre pour validation</button>
          </form>
          <section class="ops-panel">
            <h2>Stock et statut du catalogue</h2>
            <div class="ops-table">${products.map(product => `
              <article class="ops-row">
                <div><strong>${this.escape(product.name)}</strong><p>${this.statusText(product.status)}</p><small>${this.escape(product.sku || product.id)}</small></div>
                ${product.inventoryTracked === false ? '<span>Service</span>' : `
                  <label class="form-field"><span>Disponible</span><input type="number" min="0" value="${Number(product.stockAvailable || 0)}" data-stock-input="${this.escape(product.id)}" /></label>
                  <button class="btn-link" data-stock-save="${this.escape(product.id)}">Enregistrer</button>`}
              </article>`).join('') || '<p class="muted">Aucun produit soumis.</p>'}</div>
          </section>
        </div>
        <section class="ops-panel">
          <h2>Préparation des commandes</h2>
          <div class="ops-table">${orders.map(order => `
            <article class="ops-row">
              <div><strong>${this.escape(order.orderId || order.id)}</strong><p>${this.escape(order.customerName || 'Client')} · ${MarketplaceData.money(order.subtotal || order.total)}</p><small>${this.statusText(order.status)} · ${(order.items || []).length} article(s)</small></div>
              <div class="record-actions">
                ${order.status === 'confirmed' ? `<button class="btn-link" data-seller-status="preparing" data-order-id="${this.escape(order.orderId || order.id)}">Commencer</button>` : ''}
                ${['confirmed','preparing'].includes(order.status) ? `<button class="btn-link" data-seller-status="ready_for_pickup" data-order-id="${this.escape(order.orderId || order.id)}">Prête</button>` : ''}
              </div>
            </article>`).join('') || '<p class="muted">Aucune commande à préparer.</p>'}</div>
        </section>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });

      root.querySelector('#seller-product-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await MarketplaceData.saveProduct(this.formData(event.currentTarget));
          Toast.show('Produit soumis pour validation par l’administrateur', 'success', 'package-plus');
          await this.initSeller();
        } catch (error) {
          Toast.show(error.message, 'error', 'alert-circle');
        }
      });
      root.querySelectorAll('[data-stock-save]').forEach(button => {
        button.addEventListener('click', async () => {
          const input = root.querySelector(`[data-stock-input="${CSS.escape(button.dataset.stockSave)}"]`);
          try {
            await MarketplaceData.updateInventory(button.dataset.stockSave, input?.value);
            Toast.show('Stock mis à jour', 'success', 'boxes');
          } catch (error) {
            Toast.show(error.message, 'error', 'alert-circle');
          }
        });
      });
      root.querySelectorAll('[data-seller-status]').forEach(button => {
        button.addEventListener('click', async () => {
          try {
            await MarketplaceData.update('orders', button.dataset.orderId, { status: button.dataset.sellerStatus });
            Toast.show('Étape de préparation enregistrée', 'success', 'package-check');
            await this.initSeller();
          } catch (error) {
            Toast.show(error.message, 'error', 'alert-circle');
          }
        });
      });
    };

    MarketplacePages.initCourier = async function secureCourierDashboard() {
      const root = document.getElementById('courier-dashboard-root');
      if (!root) return;
      const session = await MarketplaceData.requireRole('courier');
      if (!session) return;
      const jobs = await MarketplaceData.list('orders', MarketplaceData.localKeys.orders);
      const available = jobs.filter(job => job.status === 'ready_for_pickup' && !job.courierUid);
      const mine = jobs.filter(job => job.courierUid === session.user.uid);
      const earned = mine.filter(job => job.status === 'delivered').reduce((sum, job) => sum + Number(job.payout?.courier || 0), 0);
      root.innerHTML = `
        <div class="role-kpis">
          <div class="stat-card"><i data-lucide="package-check"></i><strong>${available.length}</strong><span>Courses disponibles</span></div>
          <div class="stat-card"><i data-lucide="navigation"></i><strong>${mine.filter(job => job.status === 'in_transit').length}</strong><span>En cours</span></div>
          <div class="stat-card"><i data-lucide="wallet"></i><strong>${MarketplaceData.money(earned)}</strong><span>Gains livrés</span></div>
        </div>
        <section class="ops-panel">
          <h2>Courses autorisées</h2>
          <div class="ops-table">${jobs.map(job => {
            const assigned = job.courierUid === session.user.uid;
            return `
              <article class="ops-row">
                <div>
                  <strong>${this.escape(job.orderId || job.id)}</strong>
                  <p>${assigned ? this.escape(job.customerName || 'Client') : `${this.escape(job.emirate || '')} · adresse après acceptation`}</p>
                  <small>${this.statusText(job.status)} · gain ${MarketplaceData.money(job.payout?.courier || job.courierPayout || 0)} · ${Number(job.sellerCount || 1)} retrait(s)</small>
                </div>
                ${assigned && job.address ? `<a class="btn-link" target="_blank" rel="noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}">Map</a>` : ''}
                ${job.status === 'ready_for_pickup' && !job.courierUid ? `<button class="btn-link" data-pickup="${this.escape(job.orderId || job.id)}">Accepter</button>` : ''}
                ${assigned && job.status === 'in_transit' ? `<button class="btn-link" data-complete="${this.escape(job.orderId || job.id)}">Confirmer livraison</button>` : ''}
              </article>`;
          }).join('') || '<p class="muted">Aucune course disponible.</p>'}</div>
        </section>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
      root.querySelectorAll('[data-pickup]').forEach(button => {
        button.addEventListener('click', async () => {
          try {
            await MarketplaceData.update('orders', button.dataset.pickup, { courierUid: session.user.uid, status: 'in_transit' });
            Toast.show('Course attribuée exclusivement à votre compte', 'success', 'truck');
            await this.initCourier();
          } catch (error) {
            Toast.show(error.message, 'error', 'alert-circle');
          }
        });
      });
      root.querySelectorAll('[data-complete]').forEach(button => {
        button.addEventListener('click', async () => {
          const code = window.prompt('Demandez au client son code de livraison à 6 chiffres :');
          if (!code) return;
          try {
            await MarketplaceData.completeDelivery(button.dataset.complete, code.trim());
            Toast.show('Livraison et paiement COD confirmés', 'success', 'badge-check');
            await this.initCourier();
          } catch (error) {
            Toast.show(error.message, 'error', 'alert-circle');
          }
        });
      });
    };

    MarketplacePages.initCustomer = async function secureCustomerDashboard() {
      const root = document.getElementById('customer-dashboard-root');
      if (!root) return;
      const session = await MarketplaceData.requireRole('customer');
      if (!session) return;
      const orders = await MarketplaceData.list('orders', MarketplaceData.localKeys.orders);
      root.innerHTML = `
        <div class="role-kpis">
          <div class="stat-card"><i data-lucide="shopping-bag"></i><strong>${orders.length}</strong><span>Commandes</span></div>
          <div class="stat-card"><i data-lucide="package-check"></i><strong>${orders.filter(order => order.status === 'ready_for_pickup').length}</strong><span>Prêtes</span></div>
          <div class="stat-card"><i data-lucide="map"></i><strong>${orders.filter(order => order.status === 'in_transit').length}</strong><span>En livraison</span></div>
        </div>
        <section class="ops-panel">
          <h2>Suivi sécurisé</h2>
          <div class="ops-table">${orders.map(order => `
            <article class="ops-row">
              <div>
                <strong>${this.escape(order.id)}</strong>
                <p>${MarketplaceData.money(order.total)} · ${this.statusText(order.status)}</p>
                <small>${this.escape(order.emirate || '')} · paiement ${this.statusText(order.paymentStatus)}</small>
                ${['ready_for_pickup','in_transit'].includes(order.status) && order.deliveryCode ? `<p><strong>Code de remise : ${this.escape(order.deliveryCode)}</strong> — communiquez-le uniquement après réception.</p>` : ''}
              </div>
              ${['confirmed','preparing','ready_for_pickup'].includes(order.status) ? `<button class="btn-link danger" data-cancel-order="${this.escape(order.id)}">Annuler</button>` : ''}
            </article>`).join('') || '<p class="muted">Aucune commande pour ce compte.</p>'}</div>
        </section>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
      root.querySelectorAll('[data-cancel-order]').forEach(button => {
        button.addEventListener('click', async () => {
          try {
            await MarketplaceData.update('orders', button.dataset.cancelOrder, { status: 'cancelled' });
            Toast.show('Commande annulée et stock libéré', 'success', 'package-x');
            await this.initCustomer();
          } catch (error) {
            Toast.show(error.message, 'error', 'alert-circle');
          }
        });
      });
    };
  }

  if (typeof Toast !== 'undefined' && typeof Toast.show === 'function') {
    const showToast = Toast.show.bind(Toast);
    Toast.show = function secureMessage(message, ...args) {
      const replacements = {
        'Produit publie dans la boutique': 'Produit soumis pour validation par l’administrateur',
        'Statut approuve et identifiants generes': 'Candidature approuvée et compte existant activé'
      };
      return showToast(replacements[message] || message, ...args);
    };
  }

  window.LamylenoiseSaaS = Object.freeze({
    mode: 'trusted-backend',
    tenantId: TENANT_ID,
    region: 'me-central1',
    inventory: true,
    deliveryProof: 'customer_otp'
  });
})();
