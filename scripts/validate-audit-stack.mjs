import { readFile } from 'node:fs/promises';

const errors = [];
const read = path => readFile(path, 'utf8');

const [
  audit,
  main,
  rulesSource,
  runtime,
  admin,
  serviceWorker,
  functionsPackage
] = await Promise.all([
  read('functions/audit.js'),
  read('functions/main.js'),
  read('database.rules.json'),
  read('audit-runtime.js'),
  read('admin.html'),
  read('service-worker.js'),
  read('functions/package.json')
]);

const rules = JSON.parse(rulesSource).rules || {};

for (const path of [
  '/orders/{orderId}',
  '/products/{productId}',
  '/roleRequests/{requestId}',
  '/profiles/{uid}',
  '/deliveryJobs/{orderId}',
  '/earnings/{tenantId}/{group}/{uid}/{orderId}'
]) {
  if (!audit.includes(path)) errors.push(`Audit backend is missing trigger ${path}`);
}

if (!audit.includes("exports.listAuditEvents = onCall")) {
  errors.push('Audit backend is missing the administrator listAuditEvents callable.');
}
if (!audit.includes("profile.role !== 'admin'")) {
  errors.push('Audit listing must require an administrator profile.');
}
if (!audit.includes('SENSITIVE_KEY') || !audit.includes("'[REDACTED]'")) {
  errors.push('Audit snapshots must redact secrets and personal delivery data.');
}
if (!audit.includes("source: 'rtdb_trigger'")) {
  errors.push('Audit records must identify their server-side trigger source.');
}
if (!audit.includes("region: AUDIT_REGION")) {
  errors.push('Realtime Database audit triggers must use the database-compatible region.');
}

for (const exportName of [
  'auditOrderWrites',
  'auditProductWrites',
  'auditRoleRequestWrites',
  'auditProfileWrites',
  'auditDeliveryJobWrites',
  'auditEarningWrites',
  'listAuditEvents'
]) {
  if (!main.includes(`${exportName}: audit.${exportName}`)) {
    errors.push(`Deployed Functions composition is missing ${exportName}.`);
  }
}

if (rules.auditLogs?.['.read'] !== false || rules.auditLogs?.['.write'] !== false) {
  errors.push('auditLogs must reject every direct browser read and write.');
}
if (!rules.auditLogs?.['$tenantId']?.['.indexOn']?.includes('createdAt')) {
  errors.push('auditLogs must index createdAt for bounded administrator queries.');
}

if (!runtime.includes("callable('listAuditEvents')")) {
  errors.push('Admin audit console must use the secured listAuditEvents callable.');
}
if (!runtime.includes('document.createElement')) {
  errors.push('Admin audit console must render records through DOM APIs.');
}
if (!admin.includes('<script src="audit-runtime.js"')) {
  errors.push('admin.html must load audit-runtime.js.');
}
if (!admin.includes('audit.css')) {
  errors.push('admin.html must load the dedicated audit styles.');
}
if (!serviceWorker.includes("'/audit-runtime.js'")) {
  errors.push('The PWA shell must cache audit-runtime.js.');
}
if (!serviceWorker.includes("'/audit.css'")) {
  errors.push('The PWA shell must cache audit.css.');
}
if (!functionsPackage.includes('node --check audit.js')) {
  errors.push('Function syntax validation must include audit.js.');
}

if (errors.length) {
  console.error('Audit stack validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Audit stack validation passed. Canonical entities are tracked, records are immutable, sensitive fields are redacted and admin access uses a callable.');
