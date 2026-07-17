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
  'functions/index.js',
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
  'functions/index.js'
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

await Promise.all(requiredFiles.map(assertReadable));
await Promise.all(jsonFiles.map(validateJson));
await Promise.all(jsFiles.map(validateJavaScript));
await validateHtmlPages();
await validateFirebaseConfig();
await validateDatabaseRules();

if (errors.length) {
  console.error('Static build validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Static build validation passed. Trusted marketplace bundle is ready for emulator testing.');
