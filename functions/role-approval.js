'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

if (!getApps().length) initializeApp();
const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';
const REGION = 'me-central1';

const ROLE_REQUEST_STATUS = Object.freeze({
  SUBMITTED: 'submitted',
  UNDER_REVIEW: 'under_review',
  NEEDS_CHANGES: 'needs_changes',
  APPROVED: 'approved',
  REJECTED: 'rejected'
});
// 'pending' stays recognized so applications created before this rollout keep working.
const AWAITING_DECISION_STATUSES = new Set(['pending', ROLE_REQUEST_STATUS.SUBMITTED, ROLE_REQUEST_STATUS.UNDER_REVIEW, ROLE_REQUEST_STATUS.NEEDS_CHANGES]);
const ACTIVE_APPLICATION_STATUSES = new Set(['pending', ROLE_REQUEST_STATUS.SUBMITTED, ROLE_REQUEST_STATUS.UNDER_REVIEW]);
const MAX_HISTORY_ENTRIES = 50;
const ROLE_REQUEST_TYPES = new Set(['seller', 'courier']);

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function failure(code, message) {
  return { code, message };
}

function throwFailure(problem, fallback) {
  throw new HttpsError(problem?.code || 'aborted', problem?.message || fallback);
}

function appendRoleRequestHistory(history, entry) {
  const record = {
    status: clean(entry.status, 40),
    at: Number(entry.at) || Date.now(),
    by: clean(entry.by, 160),
    note: entry.note ? clean(entry.note, 300) : null
  };
  const next = Array.isArray(history) ? [...history, record] : [record];
  return next.slice(-MAX_HISTORY_ENTRIES);
}

function cleanRoleRequestPayload(data) {
  const type = clean(data?.type, 20);
  if (!ROLE_REQUEST_TYPES.has(type)) {
    throw new HttpsError('invalid-argument', 'Le type de candidature doit être vendeur ou livreur.');
  }
  const name = clean(data?.name, 120);
  const phone = clean(data?.phone, 40);
  const city = clean(data?.city, 100);
  const businessName = clean(data?.businessName, 160);
  const vehicle = clean(data?.vehicle, 160);
  const message = clean(data?.message, 1000);
  if (!name || !phone || !city || !businessName) {
    throw new HttpsError('invalid-argument', 'Merci de renseigner le nom, le téléphone, la ville et le nom de la boutique ou de la zone.');
  }
  return { type, name, phone, city, businessName, vehicle, message };
}

function findRoleRequestEntries(requests) {
  return Object.entries(requests || {}).map(([id, row]) => ({ id, ...(row || {}) }));
}

function findActiveRoleRequest(requests, uid, type) {
  return findRoleRequestEntries(requests)
    .find(row => row.requesterUid === uid && row.type === type && ACTIVE_APPLICATION_STATUSES.has(row.status || 'pending'));
}

function findResumableRoleRequest(requests, uid, type) {
  return findRoleRequestEntries(requests)
    .find(row => row.requesterUid === uid && row.type === type && row.status === ROLE_REQUEST_STATUS.NEEDS_CHANGES);
}

async function syncClaims(requestId, approved) {
  try {
    await getAuth().setCustomUserClaims(approved.uid, {
      role: approved.role,
      tenantId: approved.tenantId
    });
    await db.ref(`roleRequests/${requestId}`).update({
      claimsSyncStatus: 'complete',
      claimsSyncError: null,
      claimsSyncedAt: Date.now(),
      updatedAt: Date.now()
    });
    return { ...approved, claimsSyncStatus: 'complete' };
  } catch (error) {
    await db.ref(`roleRequests/${requestId}`).update({
      claimsSyncStatus: 'failed',
      claimsSyncError: clean(error?.message || 'Unknown claims error', 300),
      updatedAt: Date.now()
    });
    throw new HttpsError('internal', 'Rôle approuvé, mais la synchronisation Auth doit être relancée depuis l’administration.');
  }
}

async function validateApprovedRequest(adminUid, requestId, requestedTenant) {
  const [adminSnapshot, requestSnapshot] = await Promise.all([
    db.ref(`profiles/${adminUid}`).get(),
    db.ref(`roleRequests/${requestId}`).get()
  ]);
  const adminProfile = adminSnapshot.val();
  const roleRequest = requestSnapshot.val();
  if (!adminProfile || adminProfile.role !== 'admin' || adminProfile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Compte administrateur non autorisé.');
  }
  const adminTenant = clean(adminProfile.tenantId || DEFAULT_TENANT, 80);
  if (requestedTenant !== adminTenant) {
    throw new HttpsError('permission-denied', 'Organisation non autorisée.');
  }
  if (!roleRequest || roleRequest.status !== 'approved') {
    throw new HttpsError('failed-precondition', 'La candidature doit déjà être approuvée.');
  }
  if (!['seller', 'courier'].includes(roleRequest.assignedRole)) {
    throw new HttpsError('failed-precondition', 'Rôle approuvé invalide.');
  }
  const tenantId = clean(roleRequest.tenantId || DEFAULT_TENANT, 80);
  if (tenantId !== adminTenant) {
    throw new HttpsError('permission-denied', 'Candidature rattachée à une autre organisation.');
  }
  const candidateUid = clean(roleRequest.requesterUid, 160);
  const candidateSnapshot = await db.ref(`profiles/${candidateUid}`).get();
  const candidate = candidateSnapshot.val();
  if (!candidate || candidate.status === 'disabled') {
    throw new HttpsError('failed-precondition', 'Profil candidat absent ou désactivé.');
  }
  if (candidate.role !== roleRequest.assignedRole || clean(candidate.tenantId || DEFAULT_TENANT, 80) !== tenantId) {
    throw new HttpsError('failed-precondition', 'Le profil ne correspond pas au rôle approuvé.');
  }
  return {
    uid: candidateUid,
    role: roleRequest.assignedRole,
    tenantId
  };
}

exports.approveRoleRequest = onCall(async request => {
  const adminUid = request.auth?.uid;
  if (!adminUid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');

  const requestId = clean(request.data?.requestId, 160);
  const role = clean(request.data?.role, 40);
  const requestedTenant = clean(request.data?.tenantId || DEFAULT_TENANT, 80);
  if (!requestId || !['seller', 'courier'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Demande ou rôle invalide.');
  }

  const [adminGuardSnapshot, requestGuardSnapshot] = await Promise.all([
    db.ref(`profiles/${adminUid}`).get(),
    db.ref(`roleRequests/${requestId}`).get()
  ]);
  const adminGuard = adminGuardSnapshot.val();
  const token = request.auth?.token || {};
  const canApprove = adminGuard?.isSuperAdmin === true && token.isSuperAdmin === true
    || adminGuard?.adminPermissions?.['*'] === true
    || adminGuard?.adminPermissions?.['access.write'] === true;
  if (!adminGuard || adminGuard.role !== 'admin' || adminGuard.status === 'disabled' || token.role !== 'admin' || !canApprove) {
    throw new HttpsError('permission-denied', 'Permission de validation insuffisante.');
  }
  const guardedUid = clean(requestGuardSnapshot.val()?.requesterUid, 160);
  if (!guardedUid) throw new HttpsError('failed-precondition', 'Le candidat ne possède pas de compte associé.');
  const guardedUser = await getAuth().getUser(guardedUid);
  if (guardedUser.disabled === true || guardedUser.emailVerified !== true) {
    throw new HttpsError('failed-precondition', 'Le compte candidat doit être actif et son adresse email vérifiée.');
  }

  let problem = null;
  let approved = null;
  const now = Date.now();
  const transaction = await db.ref().transaction(current => {
    problem = null;
    approved = null;
    const root = current || {};
    const adminProfile = root.profiles?.[adminUid];
    if (!adminProfile || adminProfile.role !== 'admin' || adminProfile.status === 'disabled') {
      problem = failure('permission-denied', 'Compte administrateur non autorisé.');
      return;
    }

    const adminTenant = clean(adminProfile.tenantId || DEFAULT_TENANT, 80);
    if (requestedTenant !== adminTenant) {
      problem = failure('permission-denied', 'Organisation non autorisée.');
      return;
    }

    const roleRequest = root.roleRequests?.[requestId];
    if (!roleRequest) {
      problem = failure('not-found', 'Candidature introuvable.');
      return;
    }
    if (roleRequest.status !== 'pending' && !AWAITING_DECISION_STATUSES.has(roleRequest.status)) {
      problem = failure('failed-precondition', 'Seule une candidature en attente peut être approuvée.');
      return;
    }
    if (roleRequest.type !== role) {
      problem = failure('failed-precondition', 'Le rôle ne correspond pas à la candidature.');
      return;
    }
    const tenantId = clean(roleRequest.tenantId || DEFAULT_TENANT, 80);
    if (tenantId !== adminTenant) {
      problem = failure('permission-denied', 'Candidature rattachée à une autre organisation.');
      return;
    }

    const candidateUid = clean(roleRequest.requesterUid, 160);
    const candidate = root.profiles?.[candidateUid];
    if (!candidateUid || !candidate) {
      problem = failure('failed-precondition', 'Le candidat doit posséder un profil client existant.');
      return;
    }
    if (candidate.status === 'disabled') {
      problem = failure('failed-precondition', 'Un compte désactivé doit être réactivé par un processus distinct.');
      return;
    }
    if (candidate.role !== 'customer') {
      problem = failure('failed-precondition', 'Le candidat possède déjà un rôle professionnel.');
      return;
    }
    const candidateTenant = clean(candidate.tenantId || DEFAULT_TENANT, 80);
    if (candidateTenant !== tenantId) {
      problem = failure('failed-precondition', 'Le profil et la candidature ne partagent pas la même organisation.');
      return;
    }

    roleRequest.status = 'approved';
    roleRequest.assignedRole = role;
    roleRequest.approvedBy = adminUid;
    roleRequest.approvedAt = now;
    roleRequest.updatedAt = now;
    roleRequest.claimsSyncStatus = 'pending';
    roleRequest.claimsSyncError = null;
    roleRequest.history = appendRoleRequestHistory(roleRequest.history, { status: 'approved', at: now, by: adminUid });

    candidate.role = role;
    candidate.status = 'active';
    candidate.tenantId = tenantId;
    candidate.businessName = clean(roleRequest.businessName, 160);
    candidate.updatedAt = now;

    approved = { uid: candidateUid, role, tenantId };
    return root;
  }, undefined, false);

  if (!transaction.committed || !approved) {
    throwFailure(problem, 'La candidature n’a pas pu être approuvée.');
  }

  const synced = await syncClaims(requestId, approved);
  return { ...synced, activation: 'existing-account-updated' };
});

exports.resyncRoleClaims = onCall(async request => {
  const adminUid = request.auth?.uid;
  if (!adminUid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  const requestId = clean(request.data?.requestId, 160);
  const requestedTenant = clean(request.data?.tenantId || DEFAULT_TENANT, 80);
  if (!requestId) throw new HttpsError('invalid-argument', 'Candidature manquante.');

  const approved = await validateApprovedRequest(adminUid, requestId, requestedTenant);
  const synced = await syncClaims(requestId, approved);
  return { ...synced, activation: 'claims-resynchronized' };
});

exports.submitRoleRequestEnterprise = onCall({
  region: REGION,
  maxInstances: 30,
  timeoutSeconds: 30,
  memory: '256MiB'
}, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');

  const authUser = await getAuth().getUser(uid);
  const emailVerified = authUser.emailVerified === true && request.auth?.token?.email_verified === true;
  if (!emailVerified) {
    throw new HttpsError('failed-precondition', 'Vérifiez votre adresse email avant de soumettre une candidature.');
  }
  const email = clean(authUser.email, 254).toLowerCase();
  if (!email) throw new HttpsError('failed-precondition', 'Votre compte doit posséder une adresse email.');

  const payload = cleanRoleRequestPayload(request.data);
  const tenantId = clean(request.data?.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;

  const profileSnapshot = await db.ref(`profiles/${uid}`).get();
  const profile = profileSnapshot.val();
  if (profile?.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Ce compte est désactivé.');
  }
  if (profile?.role === payload.type && profile?.status === 'active') {
    throw new HttpsError('failed-precondition', `Ce compte possède déjà le rôle ${payload.type}.`);
  }

  const now = Date.now();
  const reservedId = db.ref('roleRequests').push().key;
  let problem = null;
  let outcome = null;

  const transaction = await db.ref('roleRequests').transaction(current => {
    problem = null;
    outcome = null;
    const requests = current || {};

    if (findActiveRoleRequest(requests, uid, payload.type)) {
      problem = failure('already-exists', `Une candidature ${payload.type} est déjà en cours pour ce compte.`);
      return;
    }

    const resumable = findResumableRoleRequest(requests, uid, payload.type);
    const targetId = resumable?.id || reservedId;
    const { id: _resumableId, ...existing } = resumable || {};

    requests[targetId] = {
      ...existing,
      tenantId,
      requesterUid: uid,
      type: payload.type,
      name: payload.name,
      email,
      phone: payload.phone,
      city: payload.city,
      businessName: payload.businessName,
      vehicle: payload.vehicle,
      message: payload.message,
      status: ROLE_REQUEST_STATUS.SUBMITTED,
      claimsSyncStatus: existing.claimsSyncStatus || null,
      claimsSyncError: null,
      rejectionReason: null,
      changesRequestedReason: null,
      createdAt: Number(existing.createdAt || now),
      submittedAt: now,
      updatedAt: now,
      history: appendRoleRequestHistory(existing.history, {
        status: ROLE_REQUEST_STATUS.SUBMITTED,
        at: now,
        by: uid,
        note: resumable ? 'resubmitted_after_changes' : null
      })
    };
    outcome = { requestId: targetId, resubmitted: Boolean(resumable) };
    return requests;
  }, undefined, false);

  if (!transaction.committed || !outcome) {
    throwFailure(problem, 'La candidature n’a pas pu être enregistrée.');
  }
  return { requestId: outcome.requestId, status: ROLE_REQUEST_STATUS.SUBMITTED, resubmitted: outcome.resubmitted };
});

exports.getMyRoleRequestsEnterprise = onCall({
  region: REGION,
  maxInstances: 30,
  timeoutSeconds: 30
}, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');

  const snapshot = await db.ref('roleRequests').orderByChild('requesterUid').equalTo(uid).limitToLast(20).get();
  const requests = findRoleRequestEntries(snapshot.val()).map(row => ({
    id: row.id,
    type: row.type === 'courier' ? 'courier' : 'seller',
    status: clean(row.status || 'submitted', 40),
    businessName: clean(row.businessName, 160),
    city: clean(row.city, 100),
    vehicle: clean(row.vehicle, 160),
    message: clean(row.message, 1000),
    rejectionReason: row.rejectionReason ? clean(row.rejectionReason, 300) : null,
    changesRequestedReason: row.changesRequestedReason ? clean(row.changesRequestedReason, 300) : null,
    claimsSyncStatus: clean(row.claimsSyncStatus, 40),
    history: Array.isArray(row.history) ? row.history.slice(-20) : [],
    createdAt: Number(row.createdAt || 0),
    updatedAt: Number(row.updatedAt || row.createdAt || 0)
  })).sort((a, b) => b.createdAt - a.createdAt);

  return { requests };
});

exports.roleRequestConstants = Object.freeze({
  DEFAULT_TENANT,
  ROLE_REQUEST_STATUS,
  AWAITING_DECISION_STATUSES: [...AWAITING_DECISION_STATUSES],
  ACTIVE_APPLICATION_STATUSES: [...ACTIVE_APPLICATION_STATUSES]
});
exports.appendRoleRequestHistory = appendRoleRequestHistory;
exports.cleanRoleRequestPayload = cleanRoleRequestPayload;
exports.findActiveRoleRequest = findActiveRoleRequest;
exports.findResumableRoleRequest = findResumableRoleRequest;
