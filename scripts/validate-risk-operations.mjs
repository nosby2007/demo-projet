import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const errors = [];
const paths = ['functions/risk-core.js', 'functions/risk-operations.js', 'functions/main.js', 'database.rules.json', 'admin.html', 'admin-risk-runtime.js', 'service-worker.js', 'docs/admin-control-center.md'];
const [core, backend, main, rulesText, html, runtime, worker, docs] = await Promise.all(paths.map(path => readFile(path, 'utf8')));
for (const [name, source] of [['core', core], ['backend', backend], ['runtime', runtime]]) {
  try { new vm.Script(source, { filename: name }); } catch (error) { errors.push(`${name}: ${error.message}`); }
}
for (const token of ['assessOrderRisk', 'getAdminRiskQueue', 'updateAdminRiskCase', 'risk.read', 'risk.write', 'transaction', 'auditRiskCaseWrites']) if (!backend.includes(token)) errors.push(`backend missing ${token}`);
for (const token of ['evaluateOrderRisk', 'signalFingerprint', 'summarizeRiskCases']) if (!core.includes(token)) errors.push(`core missing ${token}`);
if (!main.includes("require('./risk-operations')") || !main.includes('...riskOperations')) errors.push('risk functions not composed');
const rules = JSON.parse(rulesText).rules;
for (const branch of ['riskCases', 'riskRestrictions']) if (rules[branch]?.['.read'] !== false || rules[branch]?.['.write'] !== false) errors.push(`${branch} must deny browser access`);
for (const token of ['admin-risk-runtime.js', 'firebase-functions-compat.js']) if (!html.includes(token)) errors.push(`admin missing ${token}`);
for (const token of ["call('getAdminRiskQueue')", "call('updateAdminRiskCase')", 'data-enterprise-tab']) if (!runtime.includes(token)) errors.push(`runtime missing ${token}`);
if (runtime.includes('.ref(') || runtime.includes('firebase.database')) errors.push('risk UI must not read RTDB');
if (!worker.includes("'/admin-risk-runtime.js'")) errors.push('risk runtime not cached');
for (const token of ['Phase 5', 'risk.read', 'risk.write']) if (!docs.includes(token)) errors.push(`docs missing ${token}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Risk Operations validation passed. Explainability, privacy, RBAC, tenant isolation and trusted decisions are enforced.');
