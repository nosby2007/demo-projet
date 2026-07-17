import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const errors = [];
const read = path => readFile(path, 'utf8');

const [
  backend,
  main,
  rulesSource,
  runtime,
  styles,
  serviceWorker,
  customerHtml,
  sellerHtml,
  courierHtml,
  adminHtml,
  functionsPackage
] = await Promise.all([
  read('functions/notifications.js'),
  read('functions/main.js'),
  read('database.rules.json'),
  read('notifications-runtime.js'),
  read('notifications.css'),
  read('service-worker.js'),
  read('customer.html'),
  read('seller.html'),
  read('courier.html'),
  read('admin.html'),
  read('functions/package.json')
]);

for (const [name, source] of [
  ['functions/notifications.js', backend],
  ['notifications-runtime.js', runtime],
  ['service-worker.js', serviceWorker]
]) {
  try { new vm.Script(source, { filename: name }); }
  catch (error) { errors.push(`Invalid JavaScript in ${name}: ${error.message}`); }
}

const rules = JSON.parse(rulesSource).rules || {};
const inboxRule = rules.userNotifications?.['$uid'] || {};
const profileIndexes = rules.profiles?.['.indexOn'] || [];

for (const functionName of [
  'notifyOrderChanges',
  'notifyCourierNearby',
  'markNotificationRead',
  'markAllNotificationsRead'
]) {
  if (!backend.includes(`exports.${functionName}`)) errors.push(`Notification backend is missing ${functionName}.`);
  if (!main.includes(`${functionName}: notifications.${functionName}`)) errors.push(`Functions composition is missing ${functionName}.`);
}

for (const invariant of [
  "ref: '/orders/{orderId}'",
  "ref: '/orderTracking/{orderId}'",
  'current => current || payload',
  "after.status !== 'in_transit'",
  'currentDistance > NEARBY_DISTANCE_KM',
  'previousDistance > NEARBY_DISTANCE_KM',
  "profile?.status !== 'disabled'",
  "uid !== 'catalog'",
  'db.ref(`userNotifications/${recipientUid}/${payload.id}`)',
  'db.ref(`userNotifications/${uid}/${id}`).transaction'
]) {
  if (!backend.includes(invariant)) errors.push(`Notification invariant missing: ${invariant}`);
}

if (inboxRule['.write'] !== false) errors.push('Notification inboxes must reject direct browser writes.');
const readRule = String(inboxRule['.read'] || '');
if (!readRule.includes('auth.uid == $uid')) errors.push('Users must be limited to their own notification inbox.');
for (const index of ['createdAt', 'readAt']) {
  if (!inboxRule['.indexOn']?.includes(index)) errors.push(`Notification inbox must index ${index}.`);
}
for (const index of ['role', 'tenantId', 'status']) {
  if (!profileIndexes.includes(index)) errors.push(`Profiles must index ${index} for bounded role recipient queries.`);
}

for (const html of [customerHtml, sellerHtml, courierHtml, adminHtml]) {
  if (!html.includes('rel="stylesheet" href="notifications.css"')) errors.push('Every authenticated role workspace must load notifications.css.');
  if (!html.includes('<script src="notifications-runtime.js"')) errors.push('Every authenticated role workspace must load notifications-runtime.js.');
  if (html.indexOf('<script src="notifications-runtime.js"') < html.indexOf('<script src="app.js"')) {
    errors.push('Notification runtime must load after app.js so the shared header exists.');
  }
}

for (const invariant of [
  'backend.auth.onAuthStateChanged(subscribe)',
  'userNotifications/${user.uid}',
  "callable('markNotificationRead')",
  "callable('markAllNotificationsRead')",
  'Notification.requestPermission()',
  "permissionButton.addEventListener('click', toggleBrowserAlerts)",
  'document.hidden',
  'registration.showNotification',
  'safeDeepLink(notification.deepLink)',
  'document.createElement',
  'textContent'
]) {
  if (!runtime.includes(invariant)) errors.push(`Notification client invariant missing: ${invariant}`);
}
if (runtime.includes('.innerHTML')) errors.push('Notification runtime must not render notification content with innerHTML.');
if (!styles.includes('.notification-drawer') || !styles.includes('.notification-card.unread')) {
  errors.push('Notification drawer or unread styles are missing.');
}

for (const asset of ['/notifications-runtime.js', '/notifications.css']) {
  if (!serviceWorker.includes(`'${asset}'`)) errors.push(`PWA shell must cache ${asset}.`);
}
for (const invariant of [
  "self.addEventListener('notificationclick'",
  'safeNotificationUrl',
  'NOTIFICATION_PAGES',
  'self.clients.openWindow(targetUrl)'
]) {
  if (!serviceWorker.includes(invariant)) errors.push(`Service worker notification navigation is missing: ${invariant}`);
}

if (!functionsPackage.includes('node --check notifications.js')) errors.push('Function syntax validation must include notifications.js.');
if (!functionsPackage.includes('test/notifications.test.js')) errors.push('Function unit tests must include notifications.test.js.');

if (errors.length) {
  console.error('Notification stack validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Notification validation passed. Inboxes are private, browser writes are denied, alerts require explicit consent and deep links stay same-origin.');
