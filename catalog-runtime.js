/* Tenant-scoped public catalogue loader. */
'use strict';

(function tenantCatalogueRuntime() {
  if (!window.MarketplaceData || !window.AfroMarketFirebase?.db) {
    console.warn('Marketplace and Firebase must load before catalog-runtime.js');
    return;
  }

  const TENANT_ID = 'lamylenoise';

  MarketplaceData.getProducts = async function getTenantPublicProducts(fallback = []) {
    try {
      const snapshot = await window.AfroMarketFirebase.db.ref(`publicCatalog/${TENANT_ID}`).once('value');
      const values = snapshot.val() || {};
      const products = Object.entries(values)
        .map(([id, product]) => MarketplaceData.normalizeProduct({ id, ...product }, id))
        .filter(product => product.status === 'active');
      return products.length ? products : fallback;
    } catch (error) {
      console.warn('Tenant public catalogue unavailable.', error);
      return fallback;
    }
  };

  window.LamylenoiseCatalogue = Object.freeze({ tenantId: TENANT_ID, source: 'publicCatalog' });
})();
