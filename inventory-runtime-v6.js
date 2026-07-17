/* Reservation-aware seller inventory controls. */
'use strict';

(function reservationAwareInventoryRuntime() {
  if (!window.MarketplaceData || typeof window.MarketplacePages === 'undefined') return;

  MarketplaceData.updateInventory = async function updatePhysicalStock(productId, stockOnHand) {
    const functions = window.AfroMarketFirebase?.functions;
    if (!functions) throw new Error('Le service sécurisé est indisponible.');
    try {
      const response = await functions.httpsCallable('updateInventory')({
        tenantId: 'lamylenoise',
        productId,
        stockOnHand: Number(stockOnHand)
      });
      return response.data;
    } catch (error) {
      const raw = error?.details?.message || error?.message || 'Le stock n’a pas pu être modifié.';
      throw new Error(String(raw).replace(/^FirebaseError:\s*/i, ''));
    }
  };

  const initSeller = MarketplacePages.initSeller.bind(MarketplacePages);
  MarketplacePages.initSeller = async function initSellerWithPhysicalStock() {
    await initSeller();
    const root = document.getElementById('seller-dashboard-root');
    if (!root) return;

    try {
      const products = await MarketplaceData.getProducts([]);
      const byId = new Map(products.map(product => [String(product.id), product]));
      root.querySelectorAll('[data-stock-input]').forEach(input => {
        const product = byId.get(String(input.dataset.stockInput));
        if (!product) return;
        const reserved = Math.max(0, Number(product.stockReserved || 0));
        const available = Math.max(0, Number(product.stockAvailable || 0));
        input.value = String(available + reserved);
        const field = input.closest('.form-field');
        const label = field?.querySelector('span');
        if (label) label.textContent = 'Stock physique total';
        if (field && !field.querySelector('[data-reserved-note]')) {
          const note = document.createElement('small');
          note.dataset.reservedNote = 'true';
          note.className = 'muted';
          note.textContent = `${reserved} unité(s) réservée(s), ${available} disponible(s)`;
          field.append(note);
        }
      });
    } catch (error) {
      console.warn('Unable to enrich inventory controls.', error);
    }
  };
})();
