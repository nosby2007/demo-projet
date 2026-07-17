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

  try {
    await getAuth().setCustomUserClaims(approved.uid, {
      role: approved.role,
      tenantId: approved.tenantId
    });
    await db.ref(`roleRequests/${requestId}`).update({
      claimsSyncStatus: 'complete',
      claimsSyncedAt: Date.now()
    });
  } catch (error) {
    await db.ref(`roleRequests/${requestId}`).update({
      claimsSyncStatus: 'failed',
      claimsSyncError: clean(error?.message || 'Unknown claims error', 300),
      updatedAt: Date.now()
    });
    throw new HttpsError('internal', 'Rôle approuvé, mais la synchronisation Auth doit être relancée par un administrateur.');
  }

  return { ...approved, activation: 'existing-account-updated' };
});
