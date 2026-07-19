import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const errors = [];
const read = path => readFile(path, 'utf8');
const requireText = (source, value, message) => {
  if (!source.includes(value)) errors.push(message);
};

const [
  adminHtml,
  adminRuntime,
  accessRuntime,
  auditRuntime,
  adminCss,
  auditCss,
  backend,
  core,
  main,
  functionsPackage,
  serviceWorker,
  documentation
] = await Promise.all([
  read('admin.html'),
  read('admin-runtime.js'),
  read('admin-access-runtime.js'),
  read('admin-audit-runtime.js'),
  read('admin-enterprise.css'),
  read('audit.css'),
  read('functions/admin-control-center.js'),
  read('functions/admin-control-center-core.js'),
  read('functions/main.js'),
  read('functions/package.json'),
  read('service-worker.js'),
  read('docs/admin-control-center.md')
]);

for (const [name, source] of [
  ['admin-runtime.js', adminRuntime],
  ['admin-access-runtime.js', accessRuntime],
  ['admin-audit-runtime.js', auditRuntime],
  ['functions/admin-control-center.js', backend],
  ['functions/admin-control-center-core.js', core]
]) {
  try { new vm.Script(source, { filename: name }); }
  catch (error) { errors.push(`Invalid JavaScript in ${name}: ${error.message}`); }
}

for (const invariant of [
  'getAdminCommandCenter',
  'approveRoleRequestEnterprise',
  'resyncRoleClaimsEnterprise',
  'rejectRoleRequest',
  "requireAdmin(request, 'dashboard.read')",
  "requireAdmin(request, 'access.write')",
  'adminPermissions',
  'isSuperAdmin',
  'buildAdminDashboard',
  "region: REGION"
]) {
  requireText(backend, invariant, `Admin backend invariant missing: ${invariant}`);
}

for (const invariant of [
  'directSensitiveReadsDisabled: true',
  'maskEmail',
  'customerLabel',
  'lowStockProducts',
  'recognizedPlatformRevenue',
  'expectedSellerPayout',
  'expectedCourierPayout',
  'warnings'
]) {
  requireText(core, invariant, `Admin aggregation invariant missing: ${invariant}`);
}

for (const invariant of [
  'enterprise-admin-root',
  'admin-enterprise.css',
  'admin-runtime.js',
  'admin-access-runtime.js',
  'admin-audit-runtime.js',
  'firebase-functions-compat.js'
]) {
  requireText(adminHtml, invariant, `Admin page invariant missing: ${invariant}`);
}
if (adminHtml.includes('admin-command-root') || adminHtml.includes('data-role-page="admin"')) {
  errors.push('Enterprise admin page must not mount the legacy direct-read administrator root.');
}

for (const invariant of [
  "callable('getAdminCommandCenter')",
  "callable('approveRoleRequestEnterprise')",
  "callable('rejectRoleRequest')",
  'renderLoading',
  'renderError',
  'data-enterprise-tab',
  'enterprise-admin-decision-dialog',
  'user.getIdToken(true)'
]) {
  requireText(adminRuntime, invariant, `Admin runtime invariant missing: ${invariant}`);
}
for (const invariant of [
  "callable('getAdminCommandCenter')",
  "callable('resyncRoleClaimsEnterprise')",
  'data-resync-claims',
  'MutationObserver'
]) {
  requireText(accessRuntime, invariant, `Admin IAM recovery invariant missing: ${invariant}`);
}
for (const invariant of [
  "callable('listAuditEvents')",
  'document.createElement',
  'textContent = JSON.stringify',
  'data-enterprise-panel',
  'MutationObserver'
]) {
  requireText(auditRuntime, invariant, `Enterprise audit invariant missing: ${invariant}`);
}
for (const [name, source] of [
  ['admin-runtime.js', adminRuntime],
  ['admin-access-runtime.js', accessRuntime],
  ['admin-audit-runtime.js', auditRuntime]
]) {
  if (/\.ref\s*\(/.test(source) || source.includes('firebase.database')) {
    errors.push(`${name} must not read sensitive Realtime Database paths directly.`);
  }
}

for (const invariant of [
  '.enterprise-admin-kpi-grid',
  '.enterprise-admin-layout',
  '.enterprise-admin-dialog',
  '@media (max-width: 760px)'
]) {
  requireText(adminCss, invariant, `Admin responsive design invariant missing: ${invariant}`);
}
requireText(auditCss, '.enterprise-admin-audit-filters', 'Enterprise audit filters are missing responsive styles.');

requireText(main, "require('./admin-control-center')", 'Functions composition must import the admin control center.');
requireText(main, '...adminControlCenter', 'Functions composition must export the admin control center callables.');
requireText(functionsPackage, 'admin-control-center.test.js', 'Functions unit tests must include the admin control center.');
requireText(functionsPackage, 'node --check admin-control-center.js', 'Function syntax tests must include the admin backend.');
for (const asset of ['/admin-runtime.js', '/admin-access-runtime.js', '/admin-audit-runtime.js', '/admin-enterprise.css']) {
  requireText(serviceWorker, `'${asset}'`, `PWA shell must cache ${asset}.`);
}

for (const phrase of [
  'trusted callable',
  'RBAC',
  'Phase 1',
  'No direct browser reads',
  'DEPLOY_FULL'
]) {
  requireText(documentation, phrase, `Admin documentation is missing: ${phrase}`);
}

if (errors.length) {
  console.error('SOKIVA enterprise admin validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('SOKIVA enterprise admin validation passed. The command center is server-authorized, privacy-aware, resilient and free of direct sensitive database reads.');
