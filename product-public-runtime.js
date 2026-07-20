/* Dynamic product detail for Firebase catalogue items. Starter products keep the original rich storefront design. */
'use strict';

(function publicProductDetailRuntime() {
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function buildGallery(product) {
    const images = Array.isArray(product.images) && product.images.length ? product.images : [product.image].filter(Boolean);
    const gallery = element('div', 'pd-gallery');
    const mainWrap = element('div', 'pd-main-img');
    const mainImg = element('img');
    mainImg.src = images[0] || '';
    mainImg.alt = product.name || 'Produit';
    mainImg.loading = 'lazy';
    mainWrap.append(mainImg);
    gallery.append(mainWrap);

    if (images.length > 1) {
      const thumbs = element('div', 'pd-thumbs');
      images.forEach((src, index) => {
        const thumb = element('button', 'pd-thumb' + (index === 0 ? ' active' : ''));
        thumb.type = 'button';
        const thumbImg = element('img');
        thumbImg.src = src;
        thumbImg.alt = '';
        thumbImg.loading = 'lazy';
        thumb.append(thumbImg);
        thumb.addEventListener('click', () => {
          thumbs.querySelectorAll('.pd-thumb').forEach(node => node.classList.remove('active'));
          thumb.classList.add('active');
          mainImg.src = src;
        });
        thumbs.append(thumb);
      });
      gallery.append(thumbs);
    }
    return gallery;
  }

  function buildColors(product) {
    const colors = Array.isArray(product.colors) ? product.colors.filter(Boolean) : [];
    if (!colors.length) return null;
    const wrap = element('div', 'pd-colors');
    wrap.append(element('h3', '', 'Couleur'));
    const list = element('div', 'pd-color-list');
    colors.forEach((color, index) => {
      const chip = element('button', 'pd-color-chip' + (index === 0 ? ' active' : ''), color);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        list.querySelectorAll('.pd-color-chip').forEach(node => node.classList.remove('active'));
        chip.classList.add('active');
      });
      list.append(chip);
    });
    wrap.append(list);
    return wrap;
  }

  function buildDescription(product) {
    if (!product.description) return null;
    const block = element('div', 'pd-desc');
    block.append(element('h3', '', 'Description'), element('p', '', product.description));
    return block;
  }

  function buildDetails(product) {
    if (!product.details) return null;
    const lines = String(product.details).split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) return null;
    const block = element('div', 'pd-desc');
    block.append(element('h3', '', 'Détails'));
    const list = element('ul', 'pd-checklist');
    lines.forEach(line => list.append(element('li', '', line)));
    block.append(list);
    return block;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('product-detail');
    const rawId = new URLSearchParams(location.search).get('id');
    if (!root || !rawId || !window.MarketplaceData) return;
    if (!/^[A-Za-z0-9_-]{1,160}$/.test(rawId)) return;

    try {
      const products = await window.MarketplaceData.getProducts([]);
      const product = products.find(item => String(item.id) === rawId);
      if (!product) {
        root.replaceChildren();
        const empty = element('div', 'empty-state');
        const icon = element('i'); icon.setAttribute('data-lucide', 'package-search');
        const link = element('a', 'btn-primary', 'Retour à la boutique'); link.href = 'shop.html';
        empty.append(icon, element('h3', '', 'Produit indisponible'), element('p', '', 'Ce produit n’est pas disponible dans le catalogue SOKIVA.'), link);
        root.append(empty);
        if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
        return;
      }

      // app-core.js already rendered the original full product page for starter products.
      if (product.status === 'starter') return;

      document.title = `${product.name} — SOKIVA`;
      root.replaceChildren();
      const breadcrumb = element('nav', 'breadcrumb');
      const home = element('a', '', 'Accueil');
      home.href = 'index.html';
      const shop = element('a', '', 'Boutique');
      shop.href = 'shop.html';
      breadcrumb.append(home, document.createTextNode(' › '), shop, document.createTextNode(' › '), element('span', '', product.name || 'Produit'));

      const layout = element('div', 'pd-grid');
      const gallery = buildGallery(product);

      const info = element('div', 'pd-info');
      info.append(
        element('span', 'pd-brand', product.brand || product.sellerName || 'SOKIVA'),
        element('h1', 'pd-title', product.name || 'Produit')
      );
      const priceRow = element('div', 'pd-price-row');
      priceRow.append(element('span', 'pd-price', `${new Intl.NumberFormat('fr-FR').format(Number(product.price || 0))} AED`));
      info.append(priceRow);

      const delivery = element('p', 'pd-delivery');
      const truckIcon = document.createElement('i');
      truckIcon.setAttribute('data-lucide', 'truck');
      delivery.append(truckIcon, document.createTextNode(product.delivery || 'Livraison UAE avec suivi'));
      info.append(delivery);

      if (product.inventoryTracked === true) {
        const stock = element('p');
        const quantity = element('strong', '', String(Math.max(0, Number(product.stockAvailable || 0))));
        stock.append(quantity, document.createTextNode(' disponible(s)'));
        info.append(stock);
      }

      const colors = buildColors(product);
      if (colors) info.append(colors);

      const description = buildDescription(product);
      if (description) info.append(description);

      const details = buildDetails(product);
      if (details) info.append(details);

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
      console.warn('Unable to render SOKIVA public product detail.', error);
    }
  });
})();
