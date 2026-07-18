/* SOKIVA home page live catalogue preview. */
'use strict';

(function sokivaHomeRuntime() {
  const root = document.getElementById('home-catalogue-preview');
  const backend = window.SokivaFirebase;
  if (!root || !backend?.db) return;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function safeImage(value) {
    try {
      const url = new URL(String(value || ''), window.location.origin);
      return url.origin === window.location.origin || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }

  async function load() {
    root.replaceChildren();
    const loading = element('div', 'empty-state');
    const icon = element('i'); icon.setAttribute('data-lucide', 'loader-circle');
    loading.append(icon, element('h3', '', 'Chargement du catalogue réel…'));
    root.append(loading);
    if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });

    try {
      const tenantId = backend.tenantId || 'lamylenoise';
      const snapshot = await backend.db.ref(`publicCatalog/${tenantId}`).limitToFirst(4).once('value');
      const products = Object.entries(snapshot.val() || {})
        .map(([id, product]) => ({ id, ...product }))
        .filter(product => product.status === 'active' && Number(product.price) > 0);
      root.replaceChildren();
      if (!products.length) {
        const empty = element('div', 'empty-state');
        const emptyIcon = element('i'); emptyIcon.setAttribute('data-lucide', 'store');
        const action = element('a', 'btn-primary', 'Devenir vendeur'); action.href = 'request.html';
        empty.append(
          emptyIcon,
          element('h3', '', 'Le catalogue SOKIVA est en préparation'),
          element('p', '', 'Aucun faux produit n’est affiché. Les articles apparaîtront après validation des vendeurs.'),
          action
        );
        root.append(empty);
      } else {
        const grid = element('div', 'products-grid');
        products.forEach(product => {
          const card = element('article', 'product-card');
          const wrap = element('div', 'product-img-wrap');
          const link = element('a', 'product-img-link'); link.href = `product.html?id=${encodeURIComponent(product.id)}`;
          const image = element('img'); image.src = safeImage(product.image); image.alt = product.name || 'Produit SOKIVA'; image.loading = 'lazy';
          link.append(image); wrap.append(link);
          const body = element('div', 'product-body');
          body.append(
            element('p', 'product-brand', product.brand || product.sellerName || 'SOKIVA'),
            element('h3', 'product-name', product.name || 'Produit'),
            element('span', 'price-current', `${new Intl.NumberFormat('fr-FR').format(Number(product.price || 0))} AED`)
          );
          card.append(wrap, body); grid.append(card);
        });
        root.append(grid);
      }
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
    } catch (error) {
      root.replaceChildren();
      const failed = element('div', 'empty-state');
      const failedIcon = element('i'); failedIcon.setAttribute('data-lucide', 'wifi-off');
      failed.append(failedIcon, element('h3', '', 'Catalogue momentanément indisponible'), element('p', '', 'Réessayez lorsque la connexion Firebase est rétablie.'));
      root.append(failed);
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [root] });
    }
  }

  load();
})();
