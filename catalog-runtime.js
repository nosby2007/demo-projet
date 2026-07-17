/* Tenant-scoped public catalogue loader. */
'use strict';

(function tenantCatalogueRuntime() {
  if (!window.MarketplaceData || !window.AfroMarketFirebase?.db) {
    console.warn('Marketplace and Firebase must load before catalog-runtime.js');
    return;
  }

  const TENANT_ID = 'lamylenoise';
  const HTML_ENTITIES = Object.freeze({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  });

  function escapeHtml(value, max = 500) {
    return String(value || '')
      .slice(0, max)
      .replace(/[&<>"']/g, character => HTML_ENTITIES[character]);
  }

  function safeId(value) {
    const id = String(value || '').trim();
    return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : '';
  }

  function safeImageUrl(value) {
    const url = String(value || '').trim();
    if (!url) return '';
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin === window.location.origin || parsed.protocol === 'https:' || parsed.protocol === 'data:') {
        return escapeHtml(parsed.href, 1200);
      }
    } catch {
      return '';
    }
    return '';
  }

  function sanitizePublicProduct(id, product) {
    const safeProductId = safeId(id || product?.id);
    if (!safeProductId) return null;
    const normalized = MarketplaceData.normalizeProduct({
      ...product,
      id: safeProductId,
      name: escapeHtml(product?.name, 240),
      brand: escapeHtml(product?.brand || product?.sellerName, 160),
      sellerName: escapeHtml(product?.sellerName || product?.brand, 160),
      category: escapeHtml(product?.category, 80),
      delivery: escapeHtml(product?.delivery, 240),
      badge: escapeHtml(product?.badge, 40),
      image: safeImageUrl(product?.image)
    }, safeProductId);
    normalized.price = Number.isFinite(Number(product?.price)) ? Math.max(0, Number(product.price)) : 0;
    normalized.stockAvailable = product?.inventoryTracked === true
      ? Math.max(0, Number(product?.stockAvailable || 0))
      : null;
    normalized.inventoryTracked = product?.inventoryTracked === true;
    return normalized;
  }

  MarketplaceData.getProducts = async function getTenantPublicProducts(fallback = []) {
    try {
      const snapshot = await window.AfroMarketFirebase.db.ref(`publicCatalog/${TENANT_ID}`).once('value');
      const values = snapshot.val() || {};
      const products = Object.entries(values)
        .map(([id, product]) => sanitizePublicProduct(id, product))
        .filter(product => product && product.status === 'active' && product.price > 0);
      window.MarketplaceCatalog = products;
      return products.length ? products : fallback;
    } catch (error) {
      console.warn('Tenant public catalogue unavailable.', error);
      return fallback;
    }
  };

  window.LamylenoiseCatalogue = Object.freeze({ tenantId: TENANT_ID, source: 'publicCatalog' });
})();
