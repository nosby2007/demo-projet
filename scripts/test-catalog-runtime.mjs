import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('catalog-runtime.js', 'utf8');

function contextFor(backend) {
  const window = {
    location: { origin: 'https://sokiva-dev.web.app' },
    SokivaFirebase: backend,
    MarketplaceData: {
      normalizeProduct(product, id) {
        // Deliberately model the legacy normalizer that does not preserve status.
        return {
          id,
          name: product.name,
          brand: product.brand,
          sellerName: product.sellerName,
          category: product.category,
          delivery: product.delivery,
          badge: product.badge,
          image: product.image,
          price: Number(product.price || 0)
        };
      },
      async getProducts() {
        return [{ id: 'legacy-demo', status: 'active', price: 1 }];
      }
    }
  };
  return vm.createContext({
    window,
    URL,
    console: { warn() {}, log() {}, error() {} }
  });
}

const liveContext = contextFor({
  tenantId: 'lamylenoise',
  db: {
    ref(path) {
      if (path !== 'publicCatalog/lamylenoise') throw new Error(`Unexpected path: ${path}`);
      return {
        async once() {
          return {
            val() {
              return {
                active: {
                  id: 'active', tenantId: 'lamylenoise', status: 'active', name: 'Produit réel',
                  price: 25, category: 'epicerie', inventoryTracked: true, stockAvailable: 4
                },
                pending: {
                  id: 'pending', tenantId: 'lamylenoise', status: 'pending_review', name: 'Produit privé',
                  price: 30, category: 'epicerie'
                },
                foreign: {
                  id: 'foreign', tenantId: 'other-tenant', status: 'active', name: 'Produit étranger',
                  price: 40, category: 'epicerie'
                }
              };
            }
          };
        }
      };
    }
  }
});
new vm.Script(source, { filename: 'catalog-runtime.js' }).runInContext(liveContext);
const liveProducts = await liveContext.window.MarketplaceData.getProducts();
if (liveProducts.length !== 1 || liveProducts[0].id !== 'active') {
  throw new Error(`Expected only the real active tenant product, received: ${JSON.stringify(liveProducts)}`);
}
if (liveProducts[0].status !== 'active' || liveProducts[0].tenantId !== 'lamylenoise') {
  throw new Error('Catalogue sanitizer must preserve status and tenant identity.');
}

const offlineContext = contextFor({ tenantId: 'lamylenoise' });
new vm.Script(source, { filename: 'catalog-runtime.js' }).runInContext(offlineContext);
const offlineProducts = await offlineContext.window.MarketplaceData.getProducts([{ id: 'legacy-demo' }]);
if (!Array.isArray(offlineProducts) || offlineProducts.length !== 0) {
  throw new Error('Missing Firebase must return an empty catalogue and never legacy demo products.');
}

console.log('Catalogue runtime test passed. Active tenant products survive normalization and degraded mode never restores demo data.');
