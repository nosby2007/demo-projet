/* Tenant-scoped public catalogue loader with the original SOKIVA starter catalogue. */
'use strict';

(function tenantCatalogueRuntime() {
  if (!window.MarketplaceData) {
    console.warn('Marketplace runtime must load before catalog-runtime.js');
    return;
  }

  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  const TENANT_ID = backend?.tenantId || 'lamylenoise';
  const LEGACY_VALIDATION_NOTE = 'demo products are disabled from untrusted storage; curated starter products remain';
  const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/i;
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
    if (/^data:/i.test(url)) return SAFE_DATA_IMAGE.test(url) ? escapeHtml(url, 1200) : '';
    try {
      const parsed = new URL(url, window.location.origin);
      if (parsed.origin === window.location.origin || parsed.protocol === 'https:') {
        return escapeHtml(parsed.href, 1200);
      }
    } catch {
      return '';
    }
    return '';
  }

  function sanitizeProduct(id, product, status) {
    const safeProductId = safeId(id || product?.id);
    if (!safeProductId) return null;
    const normalized = window.MarketplaceData.normalizeProduct({
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
    normalized.status = status;
    normalized.tenantId = String(product?.tenantId || TENANT_ID).trim();
    normalized.price = Number.isFinite(Number(product?.price)) ? Math.max(0, Number(product.price)) : 0;
    normalized.stockAvailable = product?.inventoryTracked === true
      ? Math.max(0, Number(product?.stockAvailable || 0))
      : null;
    normalized.inventoryTracked = product?.inventoryTracked === true;
    return normalized;
  }

  function starterCatalogue() {
    const starter = Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    return starter
      .map(product => sanitizeProduct(product?.id, product, 'starter'))
      .filter(product => product && product.price > 0);
  }

  function mergeUnique(primary, starter) {
    const seen = new Set();
    return [...primary, ...starter].filter(product => {
      const key = String(product.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  window.MarketplaceData.getProducts = async function getTenantPublicProducts() {
    const starter = starterCatalogue();
    if (!backend?.db) {
      window.MarketplaceCatalog = starter;
      return starter;
    }

    try {
      const snapshot = await backend.db.ref(`publicCatalog/${TENANT_ID}`).once('value');
      const values = snapshot.val() || {};
      const published = Object.entries(values)
        .filter(([, product]) => product?.status === 'active' && Number(product?.price) > 0)
        .map(([id, product]) => sanitizeProduct(id, product, 'active'))
        .filter(product => product && product.status === 'active' && product.tenantId === TENANT_ID && product.price > 0);
      const products = mergeUnique(published, starter);
      window.MarketplaceCatalog = products;
      return products;
    } catch (error) {
      console.warn('SOKIVA public catalogue unavailable; starter catalogue retained.', error, LEGACY_VALIDATION_NOTE);
      window.MarketplaceCatalog = starter;
      return starter;
    }
  };

  window.SokivaCatalogue = Object.freeze({
    tenantId: TENANT_ID,
    brandId: 'sokiva',
    source: 'publicCatalog+starter'
  });
})();
