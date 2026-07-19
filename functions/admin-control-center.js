'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const roleApproval = require('./role-approval');
const {
  DEFAULT_TENANT,
  buildAdminDashboard
} = require('./admin-control-center-core');

if (!getApps().length) initializeApp();
const db = getDatabase();
const REGION = 'me-central1';
const DEFAULT_LIMIT = 250;
const MAX_LIMIT = 500;

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

exports.adminControlCenterInternals = {
  assertTenant,
  boundedLimit,
  hasPermission
};
