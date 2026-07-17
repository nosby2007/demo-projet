/* Dynamic product detail for tenant public catalogue items. */
'use strict';

(function publicProductDetailRuntime() {
  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('product-detail');
    const rawId = new URLSearchParams(location.search).get('id');
    if (!root || !rawId || !window.MarketplaceData) return;

    try {
      const products = await MarketplaceData.getProducts([]);
      const product = products.find(item => String(item.id) === String(rawId));
      if (!product) return;

      root.innerHTML = `
        <nav class="breadcrumb"><a href="index.html">Accueil</a> › <a href="shop.html">Boutique</a> › <span>${String(product.name || '')}</span></nav>
        <div class="pd-layout">
          <div class="pd-gallery"><img src="${String(product.image || '')}" alt="${String(product.name || '')}" class="pd-main-img" /></div>
          <div class="pd-info">
            <span class="product-brand">${String(product.brand || product.sellerName || 'LAMYLENOISE')}</span>
            <h1>${String(product.name || '')}</h1>
            <p class="pd-price">${new Intl.NumberFormat('fr-FR').format(Number(product.price || 0))} AED</p>
            <p>${String(product.delivery || 'Livraison UAE avec suivi')}</p>
            ${product.inventoryTracked === true ? `<p><strong>${Number(product.stockAvailable || 0)}</strong> disponible(s)</p>` : ''}
            <button class="btn-primary" id="add-public-product"><i data-lucide="shopping-cart"></i> Ajouter au panier</button>
          </div>
        </div>`;
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
      root.querySelector('#add-public-product')?.addEventListener('click', () => {
        if (typeof CartModule !== 'undefined') CartModule.addItem(product);
      });
    } catch (error) {
      console.warn('Unable to render public product detail.', error);
    }
  });
})();
