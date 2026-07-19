'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const audit = require('./audit');
const { buildSystemHealth, snapshotForStorage, telemetrySummary } = require('./system-health-core');

if (!getApps().length) initializeApp();
const db = getDatabase();
const REGION = 'me-central1';
const DEFAULT_TENANT = 'lamylenoise';
const SOURCE_LIMIT = 150;

function clean(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
async function authorize(request, permission) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Connectez-vous.');
  const profile = (await db.ref(`profiles/${request.auth.uid}`).get()).val();
  const token = request.auth.token || {};
  const superAdmin = token.isSuperAdmin === true && profile?.isSuperAdmin === true;
  const allowed = profile?.adminPermissions?.[permission] === true || profile?.adminPermissions?.['*'] === true;
  if (!profile || profile.status === 'disabled' || profile.role !== 'admin' || token.role !== 'admin' || (!superAdmin && !allowed)) throw new HttpsError('permission-denied', 'Permission systeme insuffisante.');
  return { uid: request.auth.uid, tenantId: clean(profile.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT };
}
function tenantFor(requested, authorized) { const value = clean(requested || authorized, 80) || DEFAULT_TENANT; if (value !== authorized) throw new HttpsError('permission-denied', 'Organisation non autorisee.'); return value; }
async function recent(path, key, limit = SOURCE_LIMIT) { const snap = await db.ref(path).orderByChild(key).limitToLast(limit).get(); return snap.val() || {}; }
async function tenantRows(path, tenantId) { const snap = await db.ref(path).orderByChild('tenantId').equalTo(tenantId).limitToLast(SOURCE_LIMIT).get(); return snap.val() || {}; }

async function collect(tenantId) {
  const [orders, deliveryJobs, supportCases, riskCases, daily, auditEvents] = await Promise.all([
    tenantRows('orders', tenantId), tenantRows('deliveryJobs', tenantId), recent(`supportCases/${tenantId}`, 'updatedAt'), recent(`riskCases/${tenantId}`, 'updatedAt'),
    db.ref(`adminDailyMetrics/${tenantId}/days`).limitToLast(7).get().then(s => s.val() || {}), recent(`auditLogs/${tenantId}`, 'createdAt', 25)
  ]);
  return buildSystemHealth({ now: Date.now(), orders, deliveryJobs, supportCases, riskCases, dailyMetrics: daily, auditEvents });
}

exports.getAdminSystemHealth = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 30 }, async request => {
  const admin = await authorize(request, 'system.read');
  const tenantId = tenantFor(request.data?.tenantId, admin.tenantId);
  const [health, historySnap] = await Promise.all([collect(tenantId), db.ref(`adminSystemTelemetry/${tenantId}`).orderByChild('generatedAt').limitToLast(30).get()]);
  return { tenantId, health, history: Object.values(historySnap.val() || {}).map(telemetrySummary).sort((a, b) => a.generatedAt - b.generatedAt) };
});

exports.captureAdminSystemHealth = onCall({ region: REGION, maxInstances: 2, timeoutSeconds: 30 }, async request => {
  const admin = await authorize(request, 'system.write');
  const tenantId = tenantFor(request.data?.tenantId, admin.tenantId);
  const health = await collect(tenantId);
  const ref = db.ref(`adminSystemTelemetry/${tenantId}`).push();
  await ref.set(snapshotForStorage(health, ref.key));
  await audit.appendAuditEvent({ tenantId, action: 'system.health_captured', entityType: 'system_telemetry', entityId: ref.key, actorUid: admin.uid, actorType: 'admin', source: 'callable', changedKeys: ['status', 'checkCounts', 'estimatedReadUnits'], after: { status: health.status }, metadata: { estimateOnly: true } });
  return { id: ref.key, status: health.status, generatedAt: health.generatedAt };
});
