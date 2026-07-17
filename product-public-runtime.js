/* Dynamic product detail for tenant public catalogue items. */
'use strict';

(function publicProductDetailRuntime() {
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('product-detail');
    const rawId = new URLSearchParams(location.search).get('id');
    if (!root || !rawId || !window.MarketplaceData) return;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(rawId)) return;

    try {
      const products = await MarketplaceData.getProducts([]);
      const product = products.find(item => String(item.id) === rawId);
      if (!product) return;

      root.replaceChildren();
      const breadcrumb = element('nav', 'breadcrumb');
      const home = element('a', '', 'Accueil');
      home.href = 'index.html';
      const shop = element('a', '', 'Boutique');
      shop.href = 'shop.html';
      breadcrumb.append(home, document.createTextNode(' › '), shop, document.createTextNode(' › '), element('span', '', product.name || 'Produit'));

      const layout = element('div', 'pd-layout');
      const gallery = element('div', 'pd-gallery');
      const image = element('img', 'pd-main-img');
      image.src = product.image || '';
      image.alt = product.name || 'Produit';
      image.loading = 'lazy';
      gallery.append(image);

      const info = element('div', 'pd-info');
      info.append(
        element('span', 'product-brand', product.brand || product.sellerName || 'LAMYLENOISE'),
        element('h1', '', product.name || 'Produit'),
        element('p', 'pd-price', `${new Intl.NumberFormat('fr-FR').format(Number(product.price || 0))} AED`),
        element('p', '', product.delivery || 'Livraison UAE avec suivi')
      );
      if (product.inventoryTracked === true) {
        const stock = element('p');
        const quantity = element('strong', '', String(Math.max(0, Number(product.stockAvailable || 0))));
        stock.append(quantity, document.createTextNode(' disponible(s)'));
        info.append(stock);
      }

      const button = element('button', 'btn-primary', ' Ajouter au panier');
      button.id = 'add-public-product';
      button.type = 'button';
      const icon = document.createElement('i');
      icon.setAttribute('data-lucide', 'shopping-cart');
      button.prepend(icon);
      info.append(button);

      layout.append(gallery, info);
      root.append(breadcrumb, layout);
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
      button.addEventListener('click', () => {
        if (typeof CartModule !== 'undefined') CartModule.addItem(product);
      });
    } catch (error) {
      console.warn('Unable to render public product detail.', error);
    }
  });
})();
