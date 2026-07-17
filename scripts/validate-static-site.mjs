import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname } from 'node:path';
import vm from 'node:vm';

const requiredFiles = [
  'index.html',
  'shop.html',
  'product.html',
  'checkout.html',
  'customer.html',
  'seller.html',
  'courier.html',
  'admin.html',
  'app.js',
  'marketplace.js',
  'saas-runtime.js',
  'catalog-runtime.js',
  'product-public-runtime.js',
  'checkout-runtime-v5.js',
  'role-sync-runtime.js',
  'firebase-functions-config.js',
  'style.css',
  'firebase.json',
  'database.rules.json',
  'functions/package.json',
  'functions/main.js',
  'functions/index.js',
  'functions/marketplace-v3.js',
  'functions/checkout-v5.js',
  'functions/checkout-v4.js',
  'functions/catalog-v4.js',
  'functions/role-approval.js',
  'functions/commerce.js',
  'functions/test/commerce.test.js',
  'functions/test/database.rules.test.js',
  'functions/test/checkout-reservations.rules.test.js',
  'scripts/deploy-safe.mjs',
  'app.webmanifest',
  'service-worker.js',
  'health.json',
  'robots.txt',
  'sitemap.xml'
];

const jsonFiles = [
  'firebase.json',
  'database.rules.json',
  'functions/package.json',
  'app.webmanifest',
  'health.json'
];
const jsFiles = [
  'app.js',
  'marketplace.js',
  'saas-runtime.js',
  'catalog-runtime.js',
  'product-public-runtime.js',
  'checkout-runtime-v5.js',
  'role-sync-runtime.js',
  'firebase-config.js',
  'firebase-functions-config.js',
  'service-worker.js',
  'functions/main.js',
  'functions/index.js',
  'functions/safe-claims.js',
  'functions/marketplace-v2.js',
  'functions/marketplace-v3.js',
  'functions/checkout-v5.js',
  'functions/checkout-v4.js',
  'functions/catalog-v4.js',
  'functions/role-approval.js',
  'functions/commerce.js',
  'functions/test/commerce.test.js',
  'functions/test/database.rules.test.js',
  'functions/test/checkout-reservations.rules.test.js'
];
const esModuleFiles = ['scripts/deploy-safe.mjs'];
const securePages = ['checkout.html', 'customer.html', 'seller.html', 'courier.html', 'admin.html'];
const errors = [];

async function assertReadable(file) {
  try {
    await access(file, constants.R_OK);
  } catch {
    errors.push(`Missing required file: ${file}`);
  }
}

async function validateJson(file) {
  try {
    JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    errors.push(`Invalid JSON in ${file}: ${error.message}`);
  }
}

async function validateJavaScript(file) {
  try {
    const source = await readFile(file, 'utf8');
    new vm.Script(source, { filename: file });
  } catch (error) {
    errors.push(`Invalid JavaScript in ${file}: ${error.message}`);
  }
}

async function validateEsModule(file) {
  try {
    const source = await readFile(file, 'utf8');
    if (!source.includes("from 'node:child_process'")) errors.push(`${file} must use the Node child_process module`);
    if (!source.includes('nursehome-7dc3f')) errors.push(`${file} must explicitly block the shared legacy project`);
    if (!source.includes('sokiva-(dev|staging|prod)')) errors.push(`${file} must allow only approved SOKIVA environments`);
  } catch (error) {
    errors.push(`Invalid ES module in ${file}: ${error.message}`);
  }
}

async function validateHtmlPages() {
  const files = (await readdir('.')).filter(file => extname(file) === '.html');
  for (const file of files) {
    const html = await readFile(file, 'utf8');
    if (!html.includes('<meta name="viewport"')) errors.push(`${file} is missing a viewport meta tag`);
    if (!html.includes('rel="stylesheet" href="style.css"')) errors.push(`${file} is missing style.css`);
    if (!html.includes('rel="manifest" href="app.webmanifest"')) errors.push(`${file} is missing app.webmanifest`);
    if (!html.includes('<script src="app.js"')) errors.push(`${file} is missing app.js`);
    if (securePages.includes(file)) {
      if (!html.includes('firebase-functions-compat.js')) errors.push(`${file} is missing Firebase Functions SDK`);
      if (!html.includes('<script src="firebase-functions-config.js"')) errors.push(`${file} is missing functions config`);
      if (!html.includes('<script src="saas-runtime.js"')) errors.push(`${file} is missing trusted SaaS runtime`);
    }
  }

  const checkout = await readFile('checkout.html', 'utf8');
  if (!checkout.includes('<script src="checkout-runtime-v5.js"')) errors.push('checkout.html is missing idempotent checkout runtime');
  const shop = await readFile('shop.html', 'utf8');
  if (!shop.includes('<script src="catalog-runtime.js"')) errors.push('shop.html is missing tenant catalogue runtime');
  const product = await readFile('product.html', 'utf8');
  if (!product.includes('<script src="catalog-runtime.js"') || !product.includes('<script src="product-public-runtime.js"')) {
    errors.push('product.html is missing tenant catalogue product runtime');
  }
  const admin = await readFile('admin.html', 'utf8');
  if (!admin.includes('<script src="role-sync-runtime.js"')) errors.push('admin.html is missing Auth claims recovery runtime');
}

async function validateFirebaseConfig() {
  const firebaseConfig = JSON.parse(await readFile('firebase.json', 'utf8'));
  const hosting = firebaseConfig.hosting;
  if (!firebaseConfig.functions?.source) errors.push('firebase.json is missing functions.source');
  if (!hosting?.public) errors.push('firebase.json is missing hosting.public');
  if (!hosting?.headers?.length) errors.push('firebase.json is missing hosting headers');
  if (!hosting?.rewrites?.some(rule => rule.source === '/health')) errors.push('firebase.json is missing /health rewrite');
  if (!hosting?.ignore?.includes('functions/**')) errors.push('Firebase Hosting must exclude functions/**');
}

async function validateDatabaseRules() {
  const rules = JSON.parse(await readFile('database.rules.json', 'utf8')).rules || {};
  for (const path of ['products', 'checkoutReservations', 'checkoutIdempotency', 'orders', 'customerOrders', 'sellerOrders', 'deliveryJobs', 'earnings']) {
    if (rules[path]?.['.write'] !== false) errors.push(`${path} must reject direct client writes`);
  }
  if (rules.products?.['.read'] !== false) errors.push('internal products must reject browser reads');
  if (rules.publicCatalog?.['$tenantId']?.['.read'] !== true) errors.push('tenant public catalogue path must be browser-readable');
  if (rules.publicCatalog?.['$tenantId']?.['.write'] !== false) errors.push('tenant public catalogue path must reject browser writes');
  const profileWriteRule = String(rules.profiles?.['$uid']?.['.write'] || '');
  if (!profileWriteRule.includes("newData.child('tenantId').val() == 'lamylenoise'")) {
    errors.push('new customer profiles must be bound to the pilot tenant');
  }
}

async function validateEmploymentBackend() {
  const marketplace = await readFile('functions/marketplace-v3.js', 'utf8');
  const checkout = await readFile('functions/checkout-v5.js', 'utf8');
  const checkoutCompat = await readFile('functions/checkout-v4.js', 'utf8');
  const catalog = await readFile('functions/catalog-v4.js', 'utf8');
  const approval = await readFile('functions/role-approval.js', 'utf8');
  const main = await readFile('functions/main.js', 'utf8');
  const commerce = await readFile('functions/commerce.js', 'utf8');
  const checkoutRuntime = await readFile('checkout-runtime-v5.js', 'utf8');
  const catalogRuntime = await readFile('catalog-runtime.js', 'utf8');
  const roleRuntime = await readFile('role-sync-runtime.js', 'utf8');
  const runtime = await readFile('saas-runtime.js', 'utf8');

  for (const functionName of ['claimDeliveryJob', 'completeDelivery']) {
    if (!marketplace.includes(`exports.${functionName}`)) errors.push(`Marketplace backend is missing ${functionName}`);
  }
  if (!checkout.includes('exports.createOrderDraft')) errors.push('Idempotent checkout backend is missing createOrderDraft');
  if (!checkout.includes('acquireIdempotency')) errors.push('Checkout must acquire a server idempotency lock');
  if (!checkout.includes('checkoutIdempotency')) errors.push('Checkout must persist idempotency state');
  if (!checkout.includes('productRef.transaction')) errors.push('Checkout stock reservations must transact per product');
  if (checkout.includes('db.ref().transaction')) errors.push('Checkout must not transact over the database root');
  if (!checkout.includes('inventoryTracked: item.inventoryTracked')) errors.push('Order items must snapshot inventory mode');
  if (!checkout.includes('exports.cleanupExpiredCheckoutReservations')) errors.push('Checkout must clean expired reservations');
  if (!checkoutCompat.includes("require('./checkout-v5')")) errors.push('Checkout compatibility module must route to v5');
  if (!checkoutRuntime.includes('idempotencyKey: attempt.key')) errors.push('Checkout client must send an idempotency key');
  if (!checkoutRuntime.includes('button.disabled = true')) errors.push('Checkout client must block double submit');

  for (const functionName of ['submitProduct', 'reviewProduct', 'updateInventory', 'seedCatalogProducts', 'rebuildPublicCatalog']) {
    if (!catalog.includes(`exports.${functionName}`)) errors.push(`Tenant catalogue backend is missing ${functionName}`);
  }
  if (!catalog.includes("product.inventoryTracked !== true")) errors.push('Inventory tracking mode must be immutable');
  if (!catalog.includes('publicCatalog')) errors.push('Active products must be published through tenant catalogue index');
  if (!catalogRuntime.includes('publicCatalog/${TENANT_ID}')) errors.push('Storefront must read the explicit tenant catalogue path');

  if (!approval.includes("roleRequest.status !== 'pending'")) errors.push('Role approval must require a pending application');
  if (!approval.includes('exports.resyncRoleClaims')) errors.push('Role claims synchronization must have a recovery callable');
  if (!roleRuntime.includes('data-resync-claims')) errors.push('Admin UI must expose claims resynchronization');

  if (!main.includes('...marketplace') || !main.includes('...checkout') || !main.includes('...catalog') || !main.includes('...roleApproval')) {
    errors.push('Deployed Functions must compose marketplace, checkout, catalogue and role approval modules');
  }
  if (main.indexOf('...checkout') < main.indexOf('...marketplace')) errors.push('Idempotent checkout must override legacy checkout');
  if (main.indexOf('...catalog') < main.indexOf('...marketplace')) errors.push('Tenant catalogue must override legacy product operations');

  if (!marketplace.includes('isClaimableDelivery(order, job, tenantId)')) errors.push('Courier claim must use the atomic claim invariant');
  if (!marketplace.includes('deliveryOtpState(order, now, MAX_OTP_ATTEMPTS)')) errors.push('Delivery OTP must enforce expiry and attempt limits');
  if (!marketplace.includes('isAdminTransitionAllowed')) errors.push('Admin order changes must use the terminal transition graph');
  if (!commerce.includes("order.status === 'ready_for_pickup'")) errors.push('Claim invariant must require a ready order');
  if (!commerce.includes("job.status === 'ready_for_pickup'")) errors.push('Claim invariant must require a ready delivery job');
  if (!runtime.includes('data-product-review')) errors.push('Admin product review controls are missing');
  if (!runtime.includes('data-stock-save')) errors.push('Seller stock controls are missing');
  if (!runtime.includes('data-complete')) errors.push('Courier delivery completion control is missing');
}

await Promise.all(requiredFiles.map(assertReadable));
await Promise.all(jsonFiles.map(validateJson));
await Promise.all(jsFiles.map(validateJavaScript));
await Promise.all(esModuleFiles.map(validateEsModule));
await validateHtmlPages();
await validateFirebaseConfig();
await validateDatabaseRules();
await validateEmploymentBackend();

if (errors.length) {
  console.error('Static build validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Static build validation passed. Checkout is idempotent, catalogue is tenant-scoped, inventory mode is immutable and Auth claims are recoverable.');
