'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');
const audit = require('./audit');
const { evaluateOrderRisk, signalFingerprint, summarizeRiskCases } = require('./risk-core');

if (!getApps().length) initializeApp();
const db = getDatabase();
const REGION = 'me-central1';
const DEFAULT_TENANT = 'lamylenoise';

function clean(value, max = 200) { return String(value ?? '').trim().slice(0, max); }

async function authorize(request, permission) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Connectez-vous.');
  const profile = (await db.ref(`profiles/${request.auth.uid}`).get()).val();
  const claim = request.auth.token || {};
  const superAdmin = claim.isSuperAdmin === true && profile?.isSuperAdmin === true;
  const allowed = profile?.adminPermissions?.[permission] === true || profile?.adminPermissions?.['*'] === true;
  if (!profile || profile.status === 'disabled' || profile.role !== 'admin' || claim.role !== 'admin' || (!superAdmin && !allowed)) {
    throw new HttpsError('permission-denied', 'Permission risque insuffisante.');
  }
  return { uid: request.auth.uid, tenantId: clean(profile.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT };
}

function tenantFor(requested, authorized) {
  const tenantId = clean(requested || authorized, 80) || DEFAULT_TENANT;
  if (tenantId !== authorized) throw new HttpsError('permission-denied', 'Organisation non autorisee.');
  return tenantId;
}

exports.assessOrderRisk = onValueWritten({ ref: '/orders/{orderId}', region: 'us-central1' }, async event => {
  if (!event.data.after.exists()) return null;
  const order = event.data.after.val() || {};
  const tenantId = clean(order.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;
  const customerUid = clean(order.customerUid, 160);
  let rapidOrderCount = 0;
  if (customerUid) {
    const recent = await db.ref('orders').orderByChild('customerUid').equalTo(customerUid).limitToLast(10).get();
    const cutoff = Date.now() - 60 * 60 * 1000;
    rapidOrderCount = Object.values(recent.val() || {}).filter(item => item.tenantId === tenantId && Number(item.createdAt || 0) >= cutoff).length;
  }
  const result = evaluateOrderRisk(order, { rapidOrderCount });
  if (!result.shouldReview) return null;
  const now = Date.now();
  const ref = db.ref(`riskCases/${tenantId}/order_${event.params.orderId}`);
  await ref.transaction(current => {
    const fingerprint = signalFingerprint(result.signals);
    if (!current) return { id: `order_${event.params.orderId}`, tenantId, subjectType: 'order', subjectRef: event.params.orderId, score: result.score, signals: result.signals, signalFingerprint: fingerprint, status: 'open', restricted: false, createdAt: now, updatedAt: now };
    const decided = ['cleared', 'restricted'].includes(current.status);
    return { ...current, score: result.score, signals: result.signals, signalFingerprint: fingerprint, newSignalsPending: decided && current.signalFingerprint !== fingerprint, updatedAt: now };
  }, undefined, false);
  return null;
});

exports.getAdminRiskQueue = onCall({ region: REGION, maxInstances: 10 }, async request => {
  const admin = await authorize(request, 'risk.read');
  const tenantId = tenantFor(request.data?.tenantId, admin.tenantId);
  const limit = Math.min(250, Math.max(25, Number(request.data?.limit || 100)));
  const snap = await db.ref(`riskCases/${tenantId}`).orderByChild('updatedAt').limitToLast(limit).get();
  return { tenantId, ...summarizeRiskCases(Object.values(snap.val() || {})), truncated: snap.numChildren() >= limit };
});

exports.updateAdminRiskCase = onCall({ region: REGION, maxInstances: 10 }, async request => {
  const admin = await authorize(request, 'risk.write');
  const tenantId = tenantFor(request.data?.tenantId, admin.tenantId);
  const caseId = clean(request.data?.caseId, 160);
  const action = clean(request.data?.action, 40);
  const reason = clean(request.data?.reason, 500);
  const valid = ['assign_self', 'review', 'clear', 'restrict', 'escalate', 'reopen'];
  if (!caseId || !valid.includes(action)) throw new HttpsError('invalid-argument', 'Action risque invalide.');
  if (['clear', 'restrict', 'escalate', 'reopen'].includes(action) && reason.length < 5) throw new HttpsError('invalid-argument', 'Motif obligatoire (5 caracteres minimum).');

  const now = Date.now();
  let problem = null;
  const tx = await db.ref().transaction(root => {
    const record = root?.riskCases?.[tenantId]?.[caseId];
    if (!record) { problem = new HttpsError('not-found', 'Alerte introuvable.'); return; }
    const allowed = {
      assign_self: ['open', 'in_review', 'escalated'], review: ['open', 'escalated'],
      clear: ['open', 'in_review', 'escalated', 'restricted'], restrict: ['open', 'in_review', 'escalated'],
      escalate: ['open', 'in_review'], reopen: ['cleared', 'restricted']
    };
    if (!allowed[action].includes(record.status)) { problem = new HttpsError('failed-precondition', 'Transition de risque non autorisee.'); return; }
    if (action === 'assign_self') record.assignedAdminUid = admin.uid;
    if (action === 'review') { record.status = 'in_review'; record.assignedAdminUid ||= admin.uid; }
    if (action === 'clear') { record.status = 'cleared'; record.restricted = false; }
    if (action === 'restrict') { record.status = 'restricted'; record.restricted = true; }
    if (action === 'escalate') record.status = 'escalated';
    if (action === 'reopen') { record.status = 'open'; record.restricted = false; }
    record.updatedAt = now;
    record.updatedBy = admin.uid;
    record.lastDecisionReason = reason || record.lastDecisionReason || '';
    record.newSignalsPending = false;
    root.riskRestrictions ||= {};
    root.riskRestrictions[tenantId] ||= {};
    const key = `${record.subjectType}_${record.subjectRef}`;
    root.riskRestrictions[tenantId][key] = { active: record.restricted === true, subjectType: record.subjectType, subjectRef: record.subjectRef, reasonCode: action, updatedAt: now, updatedBy: admin.uid };
    return root;
  }, undefined, false);
  if (!tx.committed) throw problem || new HttpsError('aborted', 'Decision impossible.');
  const record = tx.snapshot.child(`riskCases/${tenantId}/${caseId}`).val();
  await audit.appendAuditEvent({
    tenantId,
    action: `risk.${action}`,
    entityType: 'risk_case',
    entityId: caseId,
    actorUid: admin.uid,
    actorType: 'admin',
    source: 'callable',
    changedKeys: ['status', 'assignedAdminUid', 'restricted'],
    after: { status: record.status, assignedAdminUid: record.assignedAdminUid || '', restricted: record.restricted === true },
    metadata: { reasonProvided: reason.length >= 5 }
  });
  return { id: caseId, status: record.status, restricted: record.restricted === true, updatedAt: now };
});

function auditState(value) {
  if (!value) return null;
  return { status: value.status || '', score: Number(value.score || 0), assignedAdminUid: value.assignedAdminUid || '', restricted: value.restricted === true, newSignalsPending: value.newSignalsPending === true };
}

exports.auditRiskCaseWrites = onValueWritten({ ref: '/riskCases/{tenantId}/{caseId}', region: 'us-central1' }, event => audit.appendAuditEvent({
  tenantId: event.params.tenantId,
  action: 'risk.case_changed',
  entityType: 'risk_case',
  entityId: event.params.caseId,
  actorUid: 'system',
  actorType: 'system',
  source: 'rtdb_trigger',
  changedKeys: ['status', 'score', 'assignedAdminUid', 'restricted', 'newSignalsPending'],
  before: auditState(event.data.before.exists() ? event.data.before.val() : null),
  after: auditState(event.data.after.exists() ? event.data.after.val() : null)
}));
