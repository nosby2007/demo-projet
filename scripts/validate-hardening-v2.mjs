import { readFile } from 'node:fs/promises';

const errors = [];
const read = path => readFile(path, 'utf8');

const [
  checkoutWrapper,
  checkout,
  catalog,
  main,
  catalogueRuntime,
  inventoryRuntime,
  sellerHtml,
  productRuntime
] = await Promise.all([
  read('functions/checkout-v4.js'),
  read('functions/checkout-v5.js'),
  read('functions/catalog-v5.js'),
  read('functions/main.js'),
  read('catalog-runtime.js'),
  read('inventory-runtime-v6.js'),
  read('seller.html'),
  read('product-public-runtime.js')
]);

if (!checkoutWrapper.includes('timeoutSeconds: 300')) {
  errors.push('Checkout callable must finish before the 15-minute idempotency lock expires.');
}
if (!checkoutWrapper.includes('checkout.createOrderDraft.run(request)')) {
  errors.push('Checkout timeout wrapper must execute the v5 callable handler.');
}
if (!checkout.includes("current?.status === 'processing'")) {
  errors.push('Only processing idempotency locks may expire.');
}
if (!checkout.includes("state?.status === 'committed' && state.result")) {
  errors.push('Committed idempotency results must be returned on retry.');
}
if (!checkout.includes('inventoryTracked: item.inventoryTracked')) {
  errors.push('Order items must snapshot inventory mode.');
}

if (!main.includes("require('./catalog-v5')")) {
  errors.push('Deployed Functions must compose catalogue v5.');
}
if (!catalog.includes('const result = await db.ref().transaction')) {
  errors.push('Product moderation must update internal and public records atomically.');
}
if (!catalog.includes('delete tenantCatalog[productId]')) {
  errors.push('Rejected products must be removed from the tenant public catalogue.');
}
if (!catalog.includes('stockOnHand < reserved')) {
  errors.push('Physical stock cannot be set below reserved stock.');
}
if (!catalog.includes('product.stockAvailable = stockOnHand - reserved')) {
  errors.push('Available stock must be derived from physical minus reserved stock.');
}
if (!catalog.includes('product.inventoryTracked !== true')) {
  errors.push('Inventory tracking mode must remain immutable.');
}

if (!catalogueRuntime.includes('SAFE_DATA_IMAGE')) {
  errors.push('Embedded catalogue images must use an explicit safe data-image allowlist.');
}
if (!catalogueRuntime.includes('(?:png|jpe?g|gif|webp)')) {
  errors.push('Only raster data-image formats may be embedded.');
}
if (!productRuntime.includes('document.createElement')) {
  errors.push('Public product details must use DOM rendering rather than seller HTML.');
}

if (!sellerHtml.includes('<script src="inventory-runtime-v6.js"')) {
  errors.push('Seller workspace must load reservation-aware inventory controls.');
}
if (!inventoryRuntime.includes('stockOnHand: Number(stockOnHand)')) {
  errors.push('Seller inventory updates must submit physical stock.');
}
if (!inventoryRuntime.includes('available + reserved')) {
  errors.push('Seller inventory UI must display physical stock including reservations.');
}

if (errors.length) {
  console.error('Hardening regression validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Hardening regression validation passed. Idempotency, moderation, images and physical stock semantics are protected.');
