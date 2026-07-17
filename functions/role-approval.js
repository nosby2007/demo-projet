'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

if (!getApps().length) initializeApp();
const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function failure(code, message) {
  return { code, message };
}

function throwFailure(problem, fallback) {
  throw new HttpsError(problem?.code || 'aborted', problem?.message || fallback);
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
    if (roleRequest.status !== 'pending') {
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
