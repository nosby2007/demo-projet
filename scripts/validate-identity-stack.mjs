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
  catalogRuntime,
  productRuntime,
  appBootstrap,
  appCore,
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
  read('catalog-runtime.js'),
  read('product-public-runtime.js'),
  read('app.js'),
  read('app-core.js'),
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
  ['catalog-runtime.js', catalogRuntime],
  ['product-public-runtime.js', productRuntime],
  ['app.js', appBootstrap],
  ['app-core.js', appCore],
  ['functions/scripts/bootstrap-superadmin.js', bootstrap]
]) {
  try { new vm.Script(source, { filename: name }); }
  catch (error) { errors.push(`Invalid JavaScript in ${name}: ${error.message}`); }
}

const rules = JSON.parse(rulesSource).rules || {};
const profileWriteRule = String(rules.profiles?.['$uid']?.['.write'] || '');
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
  "profile.status === 'pending_verification'",
  'user.emailVerified === true',
  "request.auth?.token?.email_verified === true",
  'profileRef.transaction',
  "current.status === 'disabled'",
  "current.status !== 'pending_verification'",
  'emailVerifiedAt: activatedAt',
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
if (profileWriteRule.includes('!data.exists()')) {
  errors.push('Realtime Database rules must not allow browser-created customer profiles.');
}
if (!profileWriteRule.includes('auth.token.isSuperAdmin == true')) {
  errors.push('Protected owner administration must require a signed superadmin claim.');
}
if (!profileWriteRule.includes("data.child('isSuperAdmin').val() != true")) {
  errors.push('Regular administrators must be blocked from protected owner profiles.');
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
  'saveAddresses(',
  'MAX_ADDRESSES = 5',
  'state.orders =',
  'state.addresses =',
  'document.createElement',
  'textContent'
]) {
  requireText(accountRuntime, invariant, `Account workspace invariant missing: ${invariant}`);
}
if (accountRuntime.includes('.innerHTML')) errors.push('Authenticated account data must not render with innerHTML.');

const strictlyBrandedPages = {
  'account.html': accountHtml,
  'login.html': loginHtml,
  'register.html': registerHtml,
  'about.html': aboutHtml,
  'shop.html': shopHtml,
  'product.html': productHtml,
  'contact.html': contactHtml,
  'delivery.html': deliveryHtml,
  'faq.html': faqHtml,
  'legal.html': legalHtml
};
for (const [name, html] of Object.entries(strictlyBrandedPages)) {
  if (!html.includes('SOKIVA')) errors.push(`${name} must visibly identify SOKIVA.`);
  if (html.includes('LAMYLENOISE')) errors.push(`${name} must not contain the legacy visible brand.`);
}

for (const value of [
  'Bonjour Aminata',
  'Aminata Diop',
  'aminata.d@exemple.ae',
  '#LYN-A7K3M9',
  'Villa 12, Street 5',
  'Trade License : 12345678',
  'TRN (TVA UAE) : 100000000000003'
]) {
  for (const [name, html] of Object.entries({ accountHtml, loginHtml, registerHtml, aboutHtml, contactHtml, legalHtml })) {
    if (html.includes(value)) errors.push(`${name} contains obsolete personal demonstration data: ${value}`);
  }
}

for (const marker of ['hero-slides', 'flash-products', 'quick-cats', 'products-grid', 'delivery-section']) {
  requireText(indexHtml, marker, `Homepage must preserve the original ecommerce section: ${marker}.`);
}
for (const unwanted of ['Infrastructure SOKIVA', 'Produits validés par SOKIVA', 'Un espace adapté à chaque rôle']) {
  if (indexHtml.includes(unwanted)) errors.push(`Homepage must not contain replacement presentation copy: ${unwanted}`);
}

for (const [name, html] of [['account.html', accountHtml], ['login.html', loginHtml], ['register.html', registerHtml]]) {
  requireText(html, 'firebase-functions-compat.js', `${name} must load Firebase Functions.`);
  requireText(html, 'firebase-functions-config.js', `${name} must configure the Functions client.`);
  requireText(html, 'identity-runtime.js', `${name} must load identity-runtime.js.`);
}
requireText(accountHtml, 'account-runtime.js', 'account.html must load the authenticated account runtime.');
requireText(accountHtml, 'identity.css', 'account.html must load identity.css.');
requireText(loginHtml, 'sokiva-login-form', 'Login must use the SOKIVA authentication form.');
requireText(registerHtml, 'sokiva-register-form', 'Registration must use the SOKIVA authentication form.');
requireText(registerHtml, 'confirmPassword', 'Registration must confirm the password.');

for (const invariant of [
  "[/LAMYLENOISE/gi, 'SOKIVA']",
  "element.textContent !== 'SOKIVA'",
  'MutationObserver',
  'onAuthStateChanged(updateSessionChrome)',
  'user.getIdTokenResult()',
  "token.claims?.role === 'admin'"
]) {
  requireText(brandRuntime, invariant, `Brand migration invariant missing: ${invariant}`);
}
if (brandRuntime.includes('sanitizeSharedChrome') || brandRuntime.includes('Infrastructure SOKIVA')) {
  errors.push('Brand runtime must rename the site without rewriting storefront content.');
}

requireText(appBootstrap, 'brand-runtime.js', 'Storefront bootstrap must load the SOKIVA brand runtime.');
requireText(appBootstrap, 'app-core.js', 'Storefront bootstrap must load the preserved ecommerce application.');
for (const invariant of [
  'const PRODUCTS = [',
  'Attiéké semoule de manioc',
  'window.PRODUCTS = PRODUCTS',
  'HeroModule.init()',
  'ProductsModule.init()'
]) {
  requireText(appCore, invariant, `Original storefront invariant missing: ${invariant}`);
}

for (const invariant of [
  'publicCatalog/${TENANT_ID}',
  'starterCatalogue()',
  'mergeUnique(published, starter)',
  'window.MarketplaceCatalog = starter',
  "source: 'publicCatalog+starter'",
  'normalized.status = status',
  'normalized.tenantId ='
]) {
  requireText(catalogRuntime, invariant, `Catalogue runtime invariant missing: ${invariant}`);
}
requireText(productRuntime, 'Produit indisponible', 'Unknown product pages must show an unavailable state.');

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

for (const asset of ['/app-core.js', '/brand-runtime.js', '/identity-runtime.js', '/account-runtime.js']) {
  requireText(serviceWorker, `'${asset}'`, `PWA shell must cache ${asset}.`);
}

requireText(serviceWorker, "CACHE_VERSION = 'sokiva-v2.1.1'", 'Storefront restoration must invalidate the broken PWA cache.');

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

console.log('SOKIVA identity validation passed. The original storefront and starter products are preserved while Firebase identity, roles, orders and owner protections remain enforced.');
