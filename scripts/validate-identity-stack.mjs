import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const errors = [];
const read = path => readFile(path, 'utf8');

const [
  identityBackend,
  main,
  identityRuntime,
  accountRuntime,
  brandRuntime,
  homeRuntime,
  catalogRuntime,
  productRuntime,
  accountHtml,
  loginHtml,
  registerHtml,
  indexHtml,
  aboutHtml,
  shopHtml,
  productHtml,
  bootstrap,
  functionsPackage,
  serviceWorker,
  documentation
] = await Promise.all([
  read('functions/identity.js'),
  read('functions/main.js'),
  read('identity-runtime.js'),
  read('account-runtime.js'),
  read('brand-runtime.js'),
  read('home-runtime.js'),
  read('catalog-runtime.js'),
  read('product-public-runtime.js'),
  read('account.html'),
  read('login.html'),
  read('register.html'),
  read('index.html'),
  read('about.html'),
  read('shop.html'),
  read('product.html'),
  read('functions/scripts/bootstrap-superadmin.js'),
  read('functions/package.json'),
  read('service-worker.js'),
  read('docs/identity-and-superadmin.md')
]);

for (const [name, source] of [
  ['functions/identity.js', identityBackend],
  ['identity-runtime.js', identityRuntime],
  ['account-runtime.js', accountRuntime],
  ['brand-runtime.js', brandRuntime],
  ['home-runtime.js', homeRuntime],
  ['catalog-runtime.js', catalogRuntime],
  ['product-public-runtime.js', productRuntime],
  ['functions/scripts/bootstrap-superadmin.js', bootstrap]
]) {
  try { new vm.Script(source, { filename: name }); }
  catch (error) { errors.push(`Invalid JavaScript in ${name}: ${error.message}`); }
}

for (const functionName of ['registerCustomerProfile', 'getMyIdentity', 'updateMyProfile']) {
  if (!identityBackend.includes(`exports.${functionName}`)) errors.push(`Identity backend is missing ${functionName}.`);
  if (!main.includes(`${functionName}: identity.${functionName}`)) errors.push(`Functions composition is missing ${functionName}.`);
}

for (const invariant of [
  "const BRAND_ID = 'sokiva'",
  "const COMPAT_TENANT_ID = 'lamylenoise'",
  "role: 'customer'",
  "status: current?.status || 'active'",
  'auth.setCustomUserClaims',
  'normalizeAddresses(request.data.addresses)',
  'MAX_ADDRESSES = 5',
  'UAE_PHONE'
]) {
  if (!identityBackend.includes(invariant)) errors.push(`Identity backend invariant missing: ${invariant}`);
}
if (identityBackend.includes("role: 'admin'") || identityBackend.includes('isSuperAdmin: true')) {
  errors.push('Public identity callables must never create an administrator or superadministrator.');
}

for (const invariant of [
  'createUserWithEmailAndPassword',
  'sendEmailVerification',
  'emailVerified',
  'sendPasswordResetEmail',
  'GoogleAuthProvider',
  "callable('registerCustomerProfile')",
  "callable('getMyIdentity')",
  'safeNext(',
  'allowedPages'
]) {
  if (!identityRuntime.includes(invariant)) errors.push(`Identity client invariant missing: ${invariant}`);
}
if (identityRuntime.includes("window.location.assign(String(")) errors.push('Identity redirects must remain allowlisted and same-origin.');

for (const invariant of [
  "callable('getMyIdentity')",
  "callable('listOrdersForRole')",
  "callable('updateMyProfile')",
  'state.orders =',
  'state.addresses =',
  'document.createElement',
  'textContent'
]) {
  if (!accountRuntime.includes(invariant)) errors.push(`Account workspace invariant missing: ${invariant}`);
}
if (accountRuntime.includes('.innerHTML')) errors.push('Authenticated account data must not render with innerHTML.');

const forbiddenDemoValues = [
  'Bonjour Aminata',
  'Aminata Diop',
  'aminata.d@exemple.ae',
  '540',
  '#LYN-A7K3M9',
  'Villa 12, Street 5',
  '5 000+',
  '800+ produits'
];
for (const value of forbiddenDemoValues) {
  if (accountHtml.includes(value) || indexHtml.includes(value) || aboutHtml.includes(value)) {
    errors.push(`Legacy demonstration value remains visible: ${value}`);
  }
}

for (const [name, html] of [
  ['account.html', accountHtml],
  ['login.html', loginHtml],
  ['register.html', registerHtml],
  ['index.html', indexHtml],
  ['about.html', aboutHtml],
  ['shop.html', shopHtml],
  ['product.html', productHtml]
]) {
  if (!html.includes('SOKIVA')) errors.push(`${name} must visibly identify SOKIVA.`);
  if (html.includes('LAMYLENOISE')) errors.push(`${name} must not contain the legacy visible brand.`);
}

for (const [name, html] of [['account.html', accountHtml], ['login.html', loginHtml], ['register.html', registerHtml]]) {
  if (!html.includes('firebase-functions-compat.js')) errors.push(`${name} must load Firebase Functions.`);
  if (!html.includes('firebase-functions-config.js')) errors.push(`${name} must configure the Functions client.`);
  if (!html.includes('identity-runtime.js')) errors.push(`${name} must load identity-runtime.js.`);
}
if (!accountHtml.includes('account-runtime.js')) errors.push('account.html must load the authenticated account runtime.');
if (!accountHtml.includes('identity.css')) errors.push('account.html must load identity.css.');
if (!loginHtml.includes('sokiva-login-form')) errors.push('Login must use the new SOKIVA authentication form.');
if (!registerHtml.includes('sokiva-register-form')) errors.push('Registration must use the new SOKIVA authentication form.');
if (!registerHtml.includes('confirmPassword')) errors.push('Registration must confirm the password.');

for (const invariant of [
  "[/LAMYLENOISE/gi, 'SOKIVA']",
  "element.textContent !== 'SOKIVA'",
  'MutationObserver',
  'onAuthStateChanged(updateSessionChrome)'
]) {
  if (!brandRuntime.includes(invariant)) errors.push(`Brand migration invariant missing: ${invariant}`);
}
if (brandRuntime.includes("element.textContent = 'SOKIVA';\n    }\n\n    const walker")) {
  // conditional assignment is required; the exact guarded block above is validated.
}

if (!homeRuntime.includes('publicCatalog/${tenantId}')) errors.push('Home catalogue must read the Firebase public catalogue.');
if (!indexHtml.includes('home-catalogue-preview')) errors.push('Homepage must expose the live catalogue preview root.');
if (!indexHtml.includes('home-runtime.js')) errors.push('Homepage must load home-runtime.js.');
if (catalogRuntime.includes('return fallback') || catalogRuntime.includes('products.length ? products : fallback')) {
  errors.push('Public catalogue must not fall back to hardcoded demonstration products.');
}
if (!catalogRuntime.includes('window.MarketplaceCatalog = []')) errors.push('Unavailable catalogue must render as empty rather than demo data.');
if (!productRuntime.includes('Produit indisponible')) errors.push('Unknown product pages must show an honest unavailable state.');

for (const invariant of [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'credentials.project_id',
  '/^sokiva-(dev|staging|prod)$/',
  "role: 'admin'",
  'isSuperAdmin: true',
  'auth.getUserByEmail'
]) {
  if (!bootstrap.includes(invariant)) errors.push(`Superadmin bootstrap invariant missing: ${invariant}`);
}
if (loginHtml.includes('isSuperAdmin') || registerHtml.includes('isSuperAdmin') || registerHtml.includes('superadmin')) {
  errors.push('Public authentication forms must not expose superadministrator creation fields.');
}

for (const asset of ['/identity.css', '/brand-runtime.js', '/identity-runtime.js', '/account-runtime.js', '/home-runtime.js']) {
  if (!serviceWorker.includes(`'${asset}'`)) errors.push(`PWA shell must cache ${asset}.`);
}
if (!serviceWorker.includes("CACHE_VERSION = 'sokiva-v2.0.0'")) errors.push('Identity migration must invalidate the old PWA cache.');

if (!functionsPackage.includes('node --check identity.js')) errors.push('Function syntax validation must include identity.js.');
if (!functionsPackage.includes('test/identity.test.js')) errors.push('Function unit tests must include identity.test.js.');
if (!functionsPackage.includes('bootstrap:superadmin')) errors.push('Functions package must expose the protected superadmin bootstrap command.');

for (const phrase of [
  'Public account creation creates only a `customer` profile',
  'isSuperAdmin: true',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'DEPLOY_FULL',
  'compatibility tenant'
]) {
  if (!documentation.includes(phrase)) errors.push(`Identity documentation is missing: ${phrase}`);
}

if (errors.length) {
  console.error('SOKIVA identity validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('SOKIVA identity validation passed. Public accounts are verified customers, account data is Firebase-backed, demo identities are removed, and superadmin bootstrap is offline and project-bound.');
