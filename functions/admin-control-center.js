'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const roleApproval = require('./role-approval');
const audit = require('./audit');
const {
  DEFAULT_TENANT,
  buildAdminDashboard,
  reconciliationRows
} = require('./admin-control-center-core');

if (!getApps().length) initializeApp();
const db = getDatabase();
const REGION = 'me-central1';
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;
const MAX_SETTLEMENT_ITEMS = 50;

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function boundedLimit(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(25, parsed));
}

function hasPermission(profile, token, permission) {
  if (token?.isSuperAdmin === true && profile?.isSuperAdmin === true) return true;
  const permissions = profile?.adminPermissions || {};
  return permissions[permission] === true || permissions['*'] === true;
}

async function requireAdmin(request, permission) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  const profileSnapshot = await db.ref(`profiles/${uid}`).get();
  const profile = profileSnapshot.val();
  if (!profile || profile.role !== 'admin' || request.auth?.token?.role !== 'admin' || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Compte administrateur non autorise.');
  }
  if (!hasPermission(profile, request.auth?.token || {}, permission)) {
    throw new HttpsError('permission-denied', 'Permission administrateur insuffisante.');
  }
  const tenantId = clean(profile.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;
  return {
    uid,
    profile,
    tenantId,
    isSuperAdmin: request.auth?.token?.isSuperAdmin === true && profile.isSuperAdmin === true
  };
}

function assertTenant(requestedTenant, profileTenant) {
  const tenantId = clean(requestedTenant || profileTenant, 80) || DEFAULT_TENANT;
  if (tenantId !== profileTenant) {
    throw new HttpsError('permission-denied', 'Organisation non autorisee.');
  }
  return tenantId;
}

async function recent(path, orderKey, limit) {
  const snapshot = await db.ref(path).orderByChild(orderKey).limitToLast(limit).get();
  return snapshot.val() || {};
}

exports.getAdminCommandCenter = onCall({
  region: REGION,
  maxInstances: 20,
  timeoutSeconds: 60,
  memory: '256MiB'
}, async request => {
  const admin = await requireAdmin(request, 'dashboard.read');
  const tenantId = assertTenant(request.data?.tenantId, admin.tenantId);
  const limit = boundedLimit(request.data?.limit);

  const [roleRequestsSnapshot, ordersSnapshot, profilesSnapshot, productsSnapshot, deliveryJobsSnapshot] = await Promise.all([
    recent('roleRequests', 'createdAt', limit),
    recent('orders', 'createdAt', limit),
    recent('profiles', 'updatedAt', limit),
    recent('products', 'updatedAt', limit),
    recent('deliveryJobs', 'updatedAt', limit)
  ]);

  const permissions = admin.isSuperAdmin
    ? ['*']
    : Object.entries(admin.profile.adminPermissions || {})
      .filter(([, enabled]) => enabled === true)
      .map(([permission]) => permission);

  const dashboard = buildAdminDashboard({
    now: Date.now(),
    tenantId,
    viewer: {
      uid: admin.uid,
      name: admin.profile.name,
      email: admin.profile.email || request.auth?.token?.email,
      isSuperAdmin: admin.isSuperAdmin,
      permissions
    },
    roleRequests: roleRequestsSnapshot,
    orders: ordersSnapshot,
    profiles: profilesSnapshot,
    products: productsSnapshot,
    deliveryJobs: deliveryJobsSnapshot,
    truncated: {
      roleRequests: Object.keys(roleRequestsSnapshot).length >= limit,
      orders: Object.keys(ordersSnapshot).length >= limit,
      profiles: Object.keys(profilesSnapshot).length >= limit,
      products: Object.keys(productsSnapshot).length >= limit,
      deliveryJobs: Object.keys(deliveryJobsSnapshot).length >= limit
    },
    projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || '',
    environment: tenantId === DEFAULT_TENANT ? 'development' : 'configured',
    region: REGION
  });

  if (!hasPermission(admin.profile, request.auth?.token || {}, 'access.read')) {
    dashboard.access.pendingRequests = dashboard.access.pendingRequests.map(({ email, phone, ...row }) => row);
    dashboard.access.recentRequests = dashboard.access.recentRequests.map(({ email, phone, ...row }) => row);
  }
  return dashboard;
});

exports.approveRoleRequestEnterprise = onCall({
  region: REGION,
  maxInstances: 10,
  timeoutSeconds: 30,
  memory: '256MiB'
}, async request => {
  const admin = await requireAdmin(request, 'access.write');
  assertTenant(request.data?.tenantId, admin.tenantId);
  return roleApproval.approveRoleRequest.run(request);
});

exports.resyncRoleClaimsEnterprise = onCall({
  region: REGION,
  maxInstances: 10,
  timeoutSeconds: 30,
  memory: '256MiB'
}, async request => {
  const admin = await requireAdmin(request, 'access.write');
  assertTenant(request.data?.tenantId, admin.tenantId);
  return roleApproval.resyncRoleClaims.run(request);
});

exports.listAuditEventsEnterprise = onCall({
  region: REGION,
  maxInstances: 10,
  timeoutSeconds: 30,
  memory: '256MiB'
}, async request => {
  const admin = await requireAdmin(request, 'audit.read');
  assertTenant(request.data?.tenantId, admin.tenantId);
  return audit.listAuditEvents.run(request);
});

exports.rejectRoleRequest = onCall({
  region: REGION,
  maxInstances: 10,
  timeoutSeconds: 30,
  memory: '256MiB'
}, async request => {
  const admin = await requireAdmin(request, 'access.write');
  const tenantId = assertTenant(request.data?.tenantId, admin.tenantId);
  const requestId = clean(request.data?.requestId, 160);
  const reason = clean(request.data?.reason, 300);
  if (!requestId) throw new HttpsError('invalid-argument', 'Candidature manquante.');
  if (reason.length < 3) throw new HttpsError('invalid-argument', 'Indiquez un motif de refus.');

  let problem = null;
  const now = Date.now();
  const transaction = await db.ref(`roleRequests/${requestId}`).transaction(current => {
    problem = null;
    if (!current) {
      problem = new HttpsError('not-found', 'Candidature introuvable.');
      return;
    }
    const currentTenant = clean(current.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;
    if (currentTenant !== tenantId) {
      problem = new HttpsError('permission-denied', 'Candidature rattachee a une autre organisation.');
      return;
    }
    if ((current.status || 'pending') !== 'pending') {
      problem = new HttpsError('failed-precondition', 'Seule une candidature en attente peut etre refusee.');
      return;
    }
    return {
      ...current,
      status: 'rejected',
      rejectionReason: reason,
      rejectedBy: admin.uid,
      rejectedAt: now,
      updatedAt: now,
      claimsSyncStatus: null,
      claimsSyncError: null
    };
  }, undefined, false);

  if (!transaction.committed) {
    throw problem || new HttpsError('aborted', 'La candidature n a pas pu etre refusee.');
  }
  return { requestId, status: 'rejected', rejectedAt: now };
});

exports.getAdminReconciliation = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 30 }, async request => {
  const admin = await requireAdmin(request, 'finance.read');
  const tenantId = assertTenant(request.data?.tenantId, admin.tenantId);
  const snapshot = await db.ref(`earnings/${tenantId}`).get();
  const allRows = reconciliationRows(snapshot.val() || {}, tenantId);
  const eligible = allRows.filter(row => row.status === 'eligible');
  const settled = allRows.filter(row => row.status === 'settled');
  return {
    tenantId,
    generatedAt: Date.now(),
    summary: {
      eligibleCount: eligible.length,
      eligibleAmount: eligible.reduce((sum, row) => sum + row.amount, 0),
      settledCount: settled.length,
      settledAmount: settled.reduce((sum, row) => sum + row.amount, 0)
    },
    rows: allRows.slice(0, boundedLimit(request.data?.limit)),
    truncated: allRows.length > boundedLimit(request.data?.limit)
  };
});

exports.settleAdminEarnings = onCall({ region: REGION, maxInstances: 5, timeoutSeconds: 30 }, async request => {
  const admin = await requireAdmin(request, 'finance.write');
  const tenantId = assertTenant(request.data?.tenantId, admin.tenantId);
  const ids = [...new Set(Array.isArray(request.data?.earningIds) ? request.data.earningIds.map(id => clean(id, 500)) : [])];
  const reference = clean(request.data?.reference, 120);
  if (!ids.length || ids.length > MAX_SETTLEMENT_ITEMS) throw new HttpsError('invalid-argument', 'Selection de paiement invalide.');
  if (reference.length < 3) throw new HttpsError('invalid-argument', 'Reference de paiement obligatoire.');
  const now = Date.now();
  let problem = null;
  const result = await db.ref(`earnings/${tenantId}`).transaction(current => {
    problem = null;
    const earnings = current || {};
    for (const id of ids) {
      const [group, beneficiaryUid, orderId, ...extra] = id.split(':');
      const row = earnings?.[group]?.[beneficiaryUid]?.[orderId];
      if (extra.length || !['sellers', 'couriers'].includes(group) || !row) {
        problem = new HttpsError('not-found', 'Un paiement selectionne est introuvable.');
        return;
      }
      if ((row.status || 'eligible') !== 'eligible') {
        problem = new HttpsError('failed-precondition', 'Un paiement selectionne a deja ete traite.');
        return;
      }
      row.status = 'settled';
      row.settledAt = now;
      row.settledBy = admin.uid;
      row.settlementReference = reference;
    }
    return earnings;
  }, undefined, false);
  if (!result.committed) throw problem || new HttpsError('aborted', 'Le paiement n a pas pu etre rapproche.');
  await audit.appendAuditEvent({
    tenantId, action: 'payout.batch_settled', entityType: 'payout_batch', entityId: reference,
    actorUid: admin.uid, actorType: 'admin', source: 'admin_callable', changedKeys: ['status', 'settledAt'],
    metadata: { earningIds: ids, itemCount: ids.length }
  });
  return { reference, settledAt: now, itemCount: ids.length };
});

exports.adminTransitionOrderEnterprise = onCall({ region: REGION, maxInstances: 10, timeoutSeconds: 30 }, async request => {
  const admin = await requireAdmin(request, 'orders.write');
  const tenantId = assertTenant(request.data?.tenantId, admin.tenantId);
  const orderId = clean(request.data?.orderId, 160);
  const status = clean(request.data?.status, 60);
  const reason = clean(request.data?.reason, 300);
  if (!orderId || !['cancelled', 'ready_for_pickup'].includes(status)) throw new HttpsError('invalid-argument', 'Action commande invalide.');
  if (reason.length < 3) throw new HttpsError('invalid-argument', 'Motif administratif obligatoire.');
  const result = await require('./marketplace-v3').transitionOrder.run({ ...request, data: { tenantId, orderId, status } });
  await audit.appendAuditEvent({
    tenantId, action: `order.admin_${status}`, entityType: 'order', entityId: orderId,
    actorUid: admin.uid, actorType: 'admin', source: 'admin_callable', changedKeys: ['status'], metadata: { reason }
  });
  return result;
});

exports.adminControlCenterInternals = {
  assertTenant,
  boundedLimit,
  hasPermission
};
