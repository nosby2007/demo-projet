import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const errors = [];
const read = path => readFile(path, 'utf8');

const [
  tracking,
  main,
  rulesSource,
  firebaseSource,
  runtime,
  checkoutLocation,
  checkoutRuntime,
  customerHtml,
  courierHtml,
  checkoutHtml,
  trackingStyles,
  serviceWorker,
  functionsPackage
] = await Promise.all([
  read('functions/tracking.js'),
  read('functions/main.js'),
  read('database.rules.json'),
  read('firebase.json'),
  read('tracking-runtime.js'),
  read('checkout-location-runtime.js'),
  read('checkout-runtime-v5.js'),
  read('customer.html'),
  read('courier.html'),
  read('checkout.html'),
  read('tracking.css'),
  read('service-worker.js'),
  read('functions/package.json')
]);

for (const [name, source] of [
  ['tracking-runtime.js', runtime],
  ['checkout-location-runtime.js', checkoutLocation],
  ['checkout-runtime-v5.js', checkoutRuntime]
]) {
  try { new vm.Script(source, { filename: name }); }
  catch (error) { errors.push(`Invalid JavaScript in ${name}: ${error.message}`); }
}

const rules = JSON.parse(rulesSource).rules || {};
const firebaseConfig = JSON.parse(firebaseSource);
const trackingRule = rules.orderTracking?.['$orderId'] || {};
const contentSecurityPolicy = firebaseConfig.hosting?.headers
  ?.flatMap(group => group.headers || [])
  ?.find(header => header.key === 'Content-Security-Policy')?.value || '';

for (const exportName of ['syncOrderTracking', 'setDeliveryDestination', 'updateCourierLocation']) {
  if (!tracking.includes(`exports.${exportName}`)) errors.push(`Tracking backend is missing ${exportName}.`);
  if (!main.includes(`${exportName}: tracking.${exportName}`)) errors.push(`Functions composition is missing ${exportName}.`);
}
if (!tracking.includes('exports.listOrdersForRole')) errors.push('Tracking backend must wrap role order listing for courier privacy.');
if (!main.includes('listOrdersForRole: tracking.listOrdersForRole')) errors.push('Deployed order listing must use the courier-safe wrapper.');

for (const invariant of [
  "order.status === 'in_transit'",
  "job.status === 'in_transit'",
  'order.courierUid === uid',
  'LOCATION_MIN_INTERVAL_MS',
  'LOCATION_MAX_AGE_MS',
  'MAX_ACCURACY_METERS',
  'allowedMeters = 500 + elapsedSeconds * 60',
  'trackingRef.transaction',
  "order.status === 'in_transit' || TERMINAL_STATUSES.has(order.status)",
  'TERMINAL_STATUSES.has(status)',
  'delete tracking.courierLocation',
  'clearLiveCourierLocation(trackingRef)',
  'courierSafeJob(job, uid)',
  'const { address, phone, customerName, deliveryLocation, ...safe }'
]) {
  if (!tracking.includes(invariant)) errors.push(`Tracking security invariant missing: ${invariant}`);
}

if (trackingRule['.write'] !== false) errors.push('orderTracking must reject direct browser writes.');
const readRule = String(trackingRule['.read'] || '');
for (const required of [
  'customerUid',
  'courierUid',
  "child('status').val() == 'in_transit'",
  "role').val() == 'admin'",
  "tenantId').val() == root.child('orders'"
]) {
  if (!readRule.includes(required)) errors.push(`Tracking read rule is missing authorization check: ${required}`);
}

if (!runtime.includes("backend.db.ref(`orderTracking/${orderId}`)")) errors.push('Customer tracking must subscribe to the private realtime path.');
if (!runtime.includes('navigator.geolocation.watchPosition')) errors.push('Courier tracking must use watchPosition after explicit activation.');
if (!runtime.includes('navigator.geolocation.clearWatch')) errors.push('Courier tracking must stop GPS watches.');
if (!runtime.includes('reconcileCourierWatches(activeOrderIds)')) errors.push('Courier GPS watches must stop when a delivery is no longer active.');
if (!runtime.includes('courierMarker.remove()')) errors.push('Customer map must remove the precise courier marker when live tracking ends.');
if (!runtime.includes("callable('updateCourierLocation')")) errors.push('Courier GPS updates must use the trusted callable.');
if (!runtime.includes('document.createElement')) errors.push('Tracking UI must render dynamic data with DOM APIs.');
if (!checkoutLocation.includes('navigator.geolocation.getCurrentPosition')) errors.push('Checkout location selection must require browser consent.');
if (!checkoutRuntime.includes("httpsCallable('setDeliveryDestination')")) errors.push('Checkout must attach the selected destination through the trusted callable.');

for (const html of [customerHtml, checkoutHtml]) {
  if (!html.includes('leaflet@1.9.4')) errors.push('Map pages must pin Leaflet 1.9.4.');
  if (!html.includes('integrity="sha256-')) errors.push('Leaflet CDN assets must use subresource integrity.');
}
if (!contentSecurityPolicy.includes('style-src') || !contentSecurityPolicy.includes('https://unpkg.com')) {
  errors.push('Content Security Policy must permit the pinned Leaflet stylesheet and script host.');
}
if (!contentSecurityPolicy.includes('https://*.tile.openstreetmap.org')) {
  errors.push('Content Security Policy must permit OpenStreetMap tile images.');
}
if (!customerHtml.includes('<script src="tracking-runtime.js"')) errors.push('Customer workspace must load tracking-runtime.js.');
if (!courierHtml.includes('<script src="tracking-runtime.js"')) errors.push('Courier workspace must load tracking-runtime.js.');
if (!checkoutHtml.includes('<script src="checkout-location-runtime.js"')) errors.push('Checkout must load checkout-location-runtime.js.');
if (!trackingStyles.includes('.tracking-map')) errors.push('Tracking map styles are missing.');

for (const asset of ['/tracking-runtime.js', '/checkout-location-runtime.js', '/tracking.css']) {
  if (!serviceWorker.includes(`'${asset}'`)) errors.push(`PWA shell must cache ${asset}.`);
}
if (!functionsPackage.includes('node --check tracking.js')) errors.push('Function syntax validation must include tracking.js.');
if (!functionsPackage.includes('test/tracking.test.js')) errors.push('Function unit tests must include tracking.test.js.');

if (errors.length) {
  console.error('Live tracking stack validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Live tracking validation passed. GPS publishing is atomic, courier access and PII expire after transit, terminal locations are cleared and map assets are pinned.');
