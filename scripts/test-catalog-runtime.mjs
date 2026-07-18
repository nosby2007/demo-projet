import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile('catalog-runtime.js', 'utf8');

function contextFor(backend) {
  const window = {
    location: { origin: 'https://sokiva-dev.web.app' },
    SokivaFirebase: backend,
    PRODUCTS: [
      {
        id: 1,
        name: 'Attiéké starter',
        brand: 'SOKIVA',
        price: 22,
        category: 'epicerie',
        image: 'https://images.example.com/attieke.jpg'
      },
      {
        id: 2,
        name: 'Bissap starter',
        brand: 'SOKIVA',
        price: 18,
        category: 'boissons',
        image: 'https://images.example.com/bissap.jpg'
      }
    ],
    MarketplaceData: {
      normalizeProduct(product, id) {
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
if (liveProducts.length !== 3 || liveProducts[0].id !== 'active') {
  throw new Error(`Expected the published product followed by two starter products, received: ${JSON.stringify(liveProducts)}`);
}
if (liveProducts[0].status !== 'active' || liveProducts[0].tenantId !== 'lamylenoise') {
  throw new Error('Catalogue sanitizer must preserve published status and tenant identity.');
}
if (!liveProducts.slice(1).every(product => product.status === 'starter')) {
  throw new Error('Original products must remain available as starter catalogue entries.');
}
if (liveProducts.some(product => product.id === 'pending' || product.id === 'foreign')) {
  throw new Error('Pending or foreign-tenant Firebase products must never be exposed.');
}

const offlineContext = contextFor({ tenantId: 'lamylenoise' });
new vm.Script(source, { filename: 'catalog-runtime.js' }).runInContext(offlineContext);
const offlineProducts = await offlineContext.window.MarketplaceData.getProducts();
if (!Array.isArray(offlineProducts) || offlineProducts.length !== 2) {
  throw new Error('Missing Firebase must retain the original starter catalogue.');
}

console.log('Catalogue runtime test passed. Firebase products remain tenant-scoped and the original SOKIVA products remain available as starter data.');
