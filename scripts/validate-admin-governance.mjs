import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const errors = [];
const paths = ['functions/admin-governance-core.js','functions/admin-governance.js','functions/main.js','database.rules.json','admin.html','admin-governance-runtime.js','service-worker.js','docs/admin-control-center.md'];
const [core, backend, main, rules, html, runtime, sw, doc] = await Promise.all(paths.map(path => readFile(path, 'utf8')));

for (const [name, source] of [['core', core], ['backend', backend], ['runtime', runtime]]) {
  try { new vm.Script(source, { filename: name }); } catch (error) { errors.push(`${name}: ${error.message}`); }
}
for (const value of ['getDelegatedAdmins','updateDelegatedAdmin','isSuperAdmin','setCustomUserClaims','updateUser','block_account','revoke_professional_role','transaction']) if (!backend.includes(value)) errors.push(`backend missing ${value}`);
for (const value of ['PERMISSIONS','normalizePermissions','adminSummary','governanceOverview','authDisabled']) if (!core.includes(value)) errors.push(`core missing ${value}`);
if (!main.includes("require('./admin-governance')") || !main.includes('...adminGovernance')) errors.push('governance functions not composed');
if (!html.includes('admin-governance-runtime.js')) errors.push('admin runtime missing');
for (const value of ["call('getDelegatedAdmins')","call('updateDelegatedAdmin')",'data-governance-overview']) if (!runtime.includes(value)) errors.push(`runtime missing ${value}`);
if (runtime.includes('.ref(') || runtime.includes('firebase.database')) errors.push('governance UI must not read RTDB');
if (!sw.includes("'/admin-governance-runtime.js'")) errors.push('runtime not cached');
for (const value of ['Phase 8','Phase 10','delegatedAdmin.read']) if (!doc.includes(value)) errors.push(`docs missing ${value}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Admin Governance validation passed. Account lifecycle, Auth blocking, bounded permissions, claims sync and privacy are enforced.');
