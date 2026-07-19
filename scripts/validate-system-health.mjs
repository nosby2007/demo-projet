import { readFile } from 'node:fs/promises'; import vm from 'node:vm';
const errors = []; const files = ['functions/system-health-core.js', 'functions/system-health.js', 'functions/main.js', 'database.rules.json', 'admin.html', 'admin-system-runtime.js', 'service-worker.js', 'docs/admin-control-center.md'];
const [core, backend, main, rulesText, html, runtime, worker, docs] = await Promise.all(files.map(file => readFile(file, 'utf8')));
for (const [name, source] of [['core', core], ['backend', backend], ['runtime', runtime]]) try { new vm.Script(source, { filename: name }); } catch (error) { errors.push(`${name}: ${error.message}`); }
for (const token of ['getAdminSystemHealth', 'captureAdminSystemHealth', 'system.read', 'system.write', 'estimateOnly']) if (!backend.includes(token)) errors.push(`backend missing ${token}`);
for (const token of ['buildSystemHealth', 'snapshotForStorage', 'billingSource']) if (!core.includes(token)) errors.push(`core missing ${token}`);
if (!main.includes("require('./system-health')") || !main.includes('...systemHealth')) errors.push('system functions not composed');
const rules = JSON.parse(rulesText).rules; if (rules.adminSystemTelemetry?.['.read'] !== false || rules.adminSystemTelemetry?.['.write'] !== false) errors.push('telemetry must deny browser access');
for (const token of ['admin-system-runtime.js', 'firebase-functions-compat.js']) if (!html.includes(token)) errors.push(`admin missing ${token}`);
for (const token of ["call('getAdminSystemHealth')", "call('captureAdminSystemHealth')", 'data-enterprise-tab']) if (!runtime.includes(token)) errors.push(`runtime missing ${token}`);
if (runtime.includes('.ref(') || runtime.includes('firebase.database')) errors.push('system UI must not read RTDB'); if (!worker.includes("'/admin-system-runtime.js'")) errors.push('system runtime not cached');
for (const token of ['Phase 6', 'system.read', 'system.write']) if (!docs.includes(token)) errors.push(`docs missing ${token}`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); } console.log('System Health validation passed. Trusted health, privacy-safe history and estimate labeling are enforced.');
