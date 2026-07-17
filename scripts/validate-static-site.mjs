import { access, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname } from 'node:path';
import vm from 'node:vm';

const requiredFiles = [
  'index.html',
  'shop.html',
  'checkout.html',
  'customer.html',
  'seller.html',
  'courier.html',
  'admin.html',
  'app.js',
  'marketplace.js',
  'saas-runtime.js',
  'firebase-functions-config.js',
  'style.css',
  'firebase.json',
  'database.rules.json',
  'functions/package.json',
  'functions/main.js',
  'functions/index.js',
  'functions/marketplace-v2.js',
  'functions/commerce.js',
  'functions/test/commerce.test.js',
  'functions/test/database.rules.test.js',
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
  'firebase-config.js',
  'firebase-functions-config.js',
  'service-worker.js',
  'scripts/deploy-safe.mjs',
  'functions/main.js',
  'functions/index.js',
  'functions/safe-claims.js',
  'functions/marketplace-v2.js',
  'functions/commerce.js',
  'functions/test/commerce.test.js',
  'functions/test/database.rules.test.js'
];
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
  for (const path of ['orders', 'customerOrders', 'sellerOrders', 'deliveryJobs']) {
    if (rules[path]?.['.write'] !== false) errors.push(`${path} must reject direct client writes`);
  }
}

async function validateEmploymentBackend() {
  const backend = await readFile('functions/marketplace-v2.js', 'utf8');
  const commerce = await readFile('functions/commerce.js', 'utf8');
  const runtime = await readFile('saas-runtime.js', 'utf8');
  for (const functionName of [
    'createOrderDraft',
    'claimDeliveryJob',
    'completeDelivery',
    'reviewProduct',
    'updateInventory'
  ]) {
    if (!backend.includes(`exports.${functionName}`)) errors.push(`Backend is missing ${functionName}`);
  }
  if (!backend.includes('isClaimableDelivery(order, job, tenantId)')) errors.push('Courier claim must use the shared atomic claim invariant');
  if (!commerce.includes("order.status === 'ready_for_pickup'")) errors.push('Claim invariant must require a ready order');
  if (!commerce.includes("job.status === 'ready_for_pickup'")) errors.push('Claim invariant must require a ready delivery job');
  if (!backend.includes('deliveryCodeHash')) errors.push('Backend is missing OTP delivery proof');
  if (!runtime.includes('data-product-review')) errors.push('Admin product review controls are missing');
  if (!runtime.includes('data-stock-save')) errors.push('Seller stock controls are missing');
  if (!runtime.includes('data-complete')) errors.push('Courier delivery completion control is missing');
}

await Promise.all(requiredFiles.map(assertReadable));
await Promise.all(jsonFiles.map(validateJson));
await Promise.all(jsFiles.map(validateJavaScript));
await validateHtmlPages();
await validateFirebaseConfig();
await validateDatabaseRules();
await validateEmploymentBackend();

if (errors.length) {
  console.error('Static build validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Static build validation passed. Inventory, review, atomic courier assignment and OTP proof are present.');
