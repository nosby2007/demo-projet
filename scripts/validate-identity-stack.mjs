import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const errors = [];
const read = path => readFile(path, 'utf8');
const requireText = (source, value, message) => {
  if (!source.includes(value)) errors.push(message);
};

const [
  identityBackend,
  checkoutWrapper,
  main,
  rulesSource,
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
  contactHtml,
  deliveryHtml,
  faqHtml,
  legalHtml,
  bootstrap,
  functionsPackage,
  serviceWorker,
  documentation
] = await Promise.all([
  read('functions/identity.js'),
  read('functions/checkout-v4.js'),
  read('functions/main.js'),
  read('database.rules.json'),
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
  read('contact.html'),
  read('delivery.html'),
  read('faq.html'),
  read('legal.html'),
  read('functions/scripts/bootstrap-superadmin.js'),
  read('functions/package.json'),
  read('service-worker.js'),
  read('docs/identity-and-superadmin.md')
]);

for (const [name, source] of [
  ['functions/identity.js', identityBackend],
  ['functions/checkout-v4.js', checkoutWrapper],
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

const rules = JSON.parse(rulesSource).rules || {};
const superAdminValidation = String(rules.profiles?.['$uid']?.isSuperAdmin?.['.validate'] || '');
const roleRequestWrite = String(rules.roleRequests?.['$requestId']?.['.write'] || '');

for (const functionName of ['registerCustomerProfile', 'getMyIdentity', 'updateMyProfile']) {
  requireText(identityBackend, `exports.${functionName}`, `Identity backend is missing ${functionName}.`);
  requireText(main, `${functionName}: identity.${functionName}`, `Functions composition is missing ${functionName}.`);
}

for (const invariant of [
  "const BRAND_ID = 'sokiva'",
  "const COMPAT_TENANT_ID = 'lamylenoise'",
  "role: 'customer'",
  "'pending_verification'",
  'profileStatusForRegistration(current?.status, emailVerified)',
  "profile.status === 'pending_verification' && user.emailVerified === true",
  "status: 'active', emailVerifiedAt: activatedAt",
  "request.auth?.token?.email_verified !== true",
  'auth.setCustomUserClaims',
  'normalizeAddresses(request.data.addresses)',
  'MAX_ADDRESSES = 5',
  'UAE_PHONE',
  'signedSuperAdmin',
  "user.customClaims?.role === 'admin'",
  'delete claims.isSuperAdmin',
  'const { isSuperAdmin, ...safeCurrent }'
]) {
  requireText(identityBackend, invariant, `Identity backend invariant missing: ${invariant}`);
}
if (identityBackend.includes('isSuperAdmin: true')) {
  errors.push('Public identity callables must never create a superadministrator.');
}
if (!superAdminValidation.includes('newData.val() == data.val()')) {
  errors.push('Realtime Database rules must make isSuperAdmin immutable for every browser client.');
}
if (!roleRequestWrite.includes('auth.token.email_verified == true')) {
  errors.push('Professional applications must require a verified Firebase email token.');
}
requireText(checkoutWrapper, "request.auth.token?.email_verified !== true", 'Secure checkout must reject unverified email accounts.');

for (const invariant of [
  'createUserWithEmailAndPassword',
  'sendEmailVerification',
  'emailVerified',
  'sendPasswordResetEmail',
  'GoogleAuthProvider',
  "callable('registerCustomerProfile')",
  "callable('getMyIdentity')",
  'safeNext(',
  'allowedPages',
  'safeText(',
  'credential.user.getIdToken(true)'
]) {
  requireText(identityRuntime, invariant, `Identity client invariant missing: ${invariant}`);
}
if (identityRuntime.includes('backend.db.ref(`profiles/${credential.user.uid}`).set')) {
  errors.push('Customer registration must never fall back to direct browser profile writes.');
}
if (identityRuntime.includes('profile?.isSuperAdmin === true')) {
  errors.push('Client identity must not trust the profile superadmin flag without signed claims.');
}
if (identityRuntime.includes('window.location.assign(String(')) {
  errors.push('Identity redirects must remain allowlisted and same-origin.');
}

for (const invariant of [
  "callable('getMyIdentity')",
  "callable('listOrdersForRole')",
  "callable('updateMyProfile')",
  'state.orders =',
  'state.addresses =',
  'document.createElement',
  'textContent'
]) {
  requireText(accountRuntime, invariant, `Account workspace invariant missing: ${invariant}`);
}
if (accountRuntime.includes('.innerHTML')) errors.push('Authenticated account data must not render with innerHTML.');

const publicPages = {
  'account.html': accountHtml,
  'login.html': loginHtml,
  'register.html': registerHtml,
  'index.html': indexHtml,
  'about.html': aboutHtml,
  'shop.html': shopHtml,
  'product.html': productHtml,
  'contact.html': contactHtml,
  'delivery.html': deliveryHtml,
  'faq.html': faqHtml,
  'legal.html': legalHtml
};
const forbiddenDemoValues = [
  'Bonjour Aminata',
  'Aminata Diop',
  'aminata.d@exemple.ae',
  '#LYN-A7K3M9',
  'Villa 12, Street 5',
  '5 000+',
  '800+ produits',
  '+971 50 000 0000',
  'contact@lamylenoise.ae',
  'Trade License : 12345678',
  'TRN (TVA UAE) : 100000000000003'
];
for (const [name, html] of Object.entries(publicPages)) {
  if (!html.includes('SOKIVA')) errors.push(`${name} must visibly identify SOKIVA.`);
  if (html.includes('LAMYLENOISE')) errors.push(`${name} must not contain the legacy visible brand.`);
  for (const value of forbiddenDemoValues) {
    if (html.includes(value)) errors.push(`${name} contains legacy demonstration value: ${value}`);
  }
}

for (const [name, html] of [['account.html', accountHtml], ['login.html', loginHtml], ['register.html', registerHtml]]) {
  requireText(html, 'firebase-functions-compat.js', `${name} must load Firebase Functions.`);
  requireText(html, 'firebase-functions-config.js', `${name} must configure the Functions client.`);
  requireText(html, 'identity-runtime.js', `${name} must load identity-runtime.js.`);
}
requireText(accountHtml, 'account-runtime.js', 'account.html must load the authenticated account runtime.');
requireText(accountHtml, 'identity.css', 'account.html must load identity.css.');
requireText(loginHtml, 'sokiva-login-form', 'Login must use the new SOKIVA authentication form.');
requireText(registerHtml, 'sokiva-register-form', 'Registration must use the new SOKIVA authentication form.');
requireText(registerHtml, 'confirmPassword', 'Registration must confirm the password.');

for (const invariant of [
  "[/LAMYLENOISE/gi, 'SOKIVA']",
  "element.textContent !== 'SOKIVA'",
  'MutationObserver',
  'onAuthStateChanged(updateSessionChrome)',
  'user.getIdTokenResult()',
  "token.claims?.role === 'admin'",
  'sanitizeSharedChrome',
  'COD pilote',
  'Aucun profil, commande ou contact fictif'
]) {
  requireText(brandRuntime, invariant, `Brand migration invariant missing: ${invariant}`);
}

requireText(homeRuntime, 'publicCatalog/${tenantId}', 'Home catalogue must read the Firebase public catalogue.');
requireText(indexHtml, 'home-catalogue-preview', 'Homepage must expose the live catalogue preview root.');
requireText(indexHtml, 'home-runtime.js', 'Homepage must load home-runtime.js.');
requireText(catalogRuntime, 'MarketplaceData.getProducts = async function getTenantPublicProducts()', 'Catalogue runtime must override the legacy product source before checking Firebase availability.');
requireText(catalogRuntime, 'if (!backend?.db)', 'Catalogue runtime must handle missing Firebase explicitly.');
requireText(catalogRuntime, 'demo products are disabled', 'Missing Firebase must disable demonstration products.');
requireText(catalogRuntime, 'window.MarketplaceCatalog = []', 'Unavailable catalogue must render as empty rather than demo data.');
if (catalogRuntime.includes('return fallback') || catalogRuntime.includes('products.length ? products : fallback')) {
  errors.push('Public catalogue must not fall back to hardcoded demonstration products.');
}
requireText(productRuntime, 'Produit indisponible', 'Unknown product pages must show an honest unavailable state.');

for (const invariant of [
  'GOOGLE_APPLICATION_CREDENTIALS',
  'credentials.project_id',
  '/^sokiva-(dev|staging|prod)$/',
  "role: 'admin'",
  'isSuperAdmin: true',
  'auth.getUserByEmail'
]) {
  requireText(bootstrap, invariant, `Superadmin bootstrap invariant missing: ${invariant}`);
}
if (loginHtml.includes('isSuperAdmin') || registerHtml.includes('isSuperAdmin') || registerHtml.includes('superadmin')) {
  errors.push('Public authentication forms must not expose superadministrator creation fields.');
}

for (const asset of ['/identity.css', '/brand-runtime.js', '/identity-runtime.js', '/account-runtime.js', '/home-runtime.js']) {
  requireText(serviceWorker, `'${asset}'`, `PWA shell must cache ${asset}.`);
}
requireText(serviceWorker, "CACHE_VERSION = 'sokiva-v2.0.0'", 'Identity migration must invalidate the old PWA cache.');

requireText(functionsPackage, 'node --check identity.js', 'Function syntax validation must include identity.js.');
requireText(functionsPackage, 'test/identity.test.js', 'Function unit tests must include identity.test.js.');
requireText(functionsPackage, 'bootstrap:superadmin', 'Functions package must expose the protected superadmin bootstrap command.');

for (const phrase of [
  'Public account creation creates only a `customer` profile',
  'isSuperAdmin: true',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'DEPLOY_FULL',
  'compatibility tenant'
]) {
  requireText(documentation, phrase, `Identity documentation is missing: ${phrase}`);
}

if (errors.length) {
  console.error('SOKIVA identity validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('SOKIVA identity validation passed. Email verification is enforced server-side, demo catalogue fallbacks are disabled, account data is Firebase-backed and elevated identity requires signed claims.');
