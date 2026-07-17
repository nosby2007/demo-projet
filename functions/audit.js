'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');

if (!getApps().length) initializeApp();
const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';
const AUDIT_REGION = 'us-central1';
const MAX_AUDIT_ROWS = 200;
const REDACTED = '[REDACTED]';
const SENSITIVE_KEY = /(password|secret|token|authorization|cookie|deliverycode|otp|hash|idempotency|email|phone|address)/i;

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function sanitize(value, depth = 0) {
  if (value === null || value === undefined) return value ?? null;
  if (depth > 4) return '[TRUNCATED]';
  if (typeof value === 'string') return value.slice(0, 500);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, depth + 1));
  if (typeof value !== 'object') return clean(value, 500);

  const output = {};
  for (const [key, child] of Object.entries(value).slice(0, 40)) {
    output[key] = SENSITIVE_KEY.test(key) ? REDACTED : sanitize(child, depth + 1);
  }
  return output;
}

function changedKeys(before, after) {
  const keys = new Set([
    ...Object.keys(before && typeof before === 'object' ? before : {}),
    ...Object.keys(after && typeof after === 'object' ? after : {})
  ]);
  return [...keys]
    .filter(key => JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]))
    .slice(0, 40);
}

function actionFor(entityType, before, after) {
  if (!before && after) return `${entityType}.created`;
  if (before && !after) return `${entityType}.deleted`;
  if (before?.role !== after?.role) return `${entityType}.role_changed`;
  if (before?.status !== after?.status) return `${entityType}.status_changed`;
  if (before?.paymentStatus !== after?.paymentStatus) return `${entityType}.payment_changed`;
  if (
    before?.stockAvailable !== after?.stockAvailable ||
    before?.stockReserved !== after?.stockReserved ||
    before?.stockSold !== after?.stockSold
  ) return `${entityType}.inventory_changed`;
  return `${entityType}.updated`;
}

function actorFor(event, before, after, fallbackUid = '') {
  const inferredUid = clean(
    event.authId ||
    after?.approvedBy || after?.reviewedBy || after?.courierUid || after?.customerUid || after?.sellerUid ||
    before?.approvedBy || before?.reviewedBy || before?.courierUid || before?.customerUid || before?.sellerUid ||
    fallbackUid || 'system',
    200
  );
  return {
    uid: inferredUid,
    type: clean(event.authType || (inferredUid === 'system' ? 'system' : 'inferred'), 40)
  };
}

async function appendAuditEvent(event) {
  const tenantId = clean(event.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;
  const auditRef = db.ref(`auditLogs/${tenantId}`).push();
  const record = {
    id: auditRef.key,
    tenantId,
    action: clean(event.action, 120),
    entityType: clean(event.entityType, 80),
    entityId: clean(event.entityId, 200),
    actorUid: clean(event.actorUid || 'system', 200),
    actorType: clean(event.actorType || 'system', 40),
    source: clean(event.source || 'backend', 80),
    outcome: clean(event.outcome || 'success', 40),
    changedKeys: Array.isArray(event.changedKeys) ? event.changedKeys.slice(0, 40).map(key => clean(key, 100)) : [],
    before: sanitize(event.before),
    after: sanitize(event.after),
    metadata: sanitize(event.metadata || {}),
    createdAt: Number(event.createdAt || Date.now())
  };
  await auditRef.set(record);
  return record;
}

async function recordWrite(event, entityType, entityId, options = {}) {
  const before = event.data.before.exists() ? event.data.before.val() : null;
  const after = event.data.after.exists() ? event.data.after.val() : null;
  if (JSON.stringify(before) === JSON.stringify(after)) return null;

  const tenantId = clean(
    options.tenantId || after?.tenantId || before?.tenantId || DEFAULT_TENANT,
    80
  ) || DEFAULT_TENANT;
  const actor = actorFor(event, before, after, options.fallbackUid);
  return appendAuditEvent({
    tenantId,
    action: actionFor(entityType, before, after),
    entityType,
    entityId,
    actorUid: actor.uid,
    actorType: actor.type,
    source: 'rtdb_trigger',
    changedKeys: changedKeys(before, after),
    before,
    after,
    metadata: {
      eventId: clean(event.id, 200),
      databaseInstance: clean(event.instance || '', 160)
    }
  });
}

exports.auditOrderWrites = onValueWritten({
  ref: '/orders/{orderId}',
  region: AUDIT_REGION
}, event => recordWrite(event, 'order', event.params.orderId));

exports.auditProductWrites = onValueWritten({
  ref: '/products/{productId}',
  region: AUDIT_REGION
}, event => recordWrite(event, 'product', event.params.productId));

exports.auditRoleRequestWrites = onValueWritten({
  ref: '/roleRequests/{requestId}',
  region: AUDIT_REGION
}, event => recordWrite(event, 'role_request', event.params.requestId));

exports.auditProfileWrites = onValueWritten({
  ref: '/profiles/{uid}',
  region: AUDIT_REGION
}, event => recordWrite(event, 'profile', event.params.uid, { fallbackUid: event.params.uid }));

exports.auditDeliveryJobWrites = onValueWritten({
  ref: '/deliveryJobs/{orderId}',
  region: AUDIT_REGION
}, event => recordWrite(event, 'delivery_job', event.params.orderId));

exports.auditEarningWrites = onValueWritten({
  ref: '/earnings/{tenantId}/{group}/{uid}/{orderId}',
  region: AUDIT_REGION
}, event => recordWrite(event, 'earning', `${event.params.group}:${event.params.uid}:${event.params.orderId}`, {
  tenantId: event.params.tenantId,
  fallbackUid: event.params.uid
}));

exports.listAuditEvents = onCall({ region: 'me-central1', maxInstances: 10 }, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');

  const profileSnapshot = await db.ref(`profiles/${uid}`).get();
  const profile = profileSnapshot.val();
  if (!profile || profile.role !== 'admin' || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Accès audit réservé aux administrateurs actifs.');
  }

  const tenantId = clean(request.data?.tenantId || profile.tenantId || DEFAULT_TENANT, 80);
  const profileTenant = clean(profile.tenantId || DEFAULT_TENANT, 80);
  if (!tenantId || tenantId !== profileTenant) {
    throw new HttpsError('permission-denied', 'Organisation non autorisée.');
  }

  const limit = Math.min(MAX_AUDIT_ROWS, Math.max(1, Number.parseInt(request.data?.limit || 100, 10)));
  const action = clean(request.data?.action, 120);
  const entityType = clean(request.data?.entityType, 80);
  const entityId = clean(request.data?.entityId, 200);

  const snapshot = await db.ref(`auditLogs/${tenantId}`)
    .orderByChild('createdAt')
    .limitToLast(limit)
    .get();
  const events = Object.values(snapshot.val() || {})
    .filter(row => !action || row.action === action)
    .filter(row => !entityType || row.entityType === entityType)
    .filter(row => !entityId || row.entityId === entityId)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));

  return { tenantId, events };
});

exports.appendAuditEvent = appendAuditEvent;
exports.sanitizeAuditValue = sanitize;
