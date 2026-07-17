'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

if (!getApps().length) initializeApp();
const db = getDatabase();

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

exports.claimDeliveryJob = onCall(async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour accepter une course.');

  const profileSnapshot = await db.ref(`profiles/${uid}`).get();
  const profile = profileSnapshot.val();
  if (!profile || profile.role !== 'courier' || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Compte livreur non autorisé.');
  }

  const orderId = clean(request.data?.orderId);
  if (!orderId) throw new HttpsError('invalid-argument', 'Commande manquante.');

  const jobRef = db.ref(`deliveryJobs/${orderId}`);
  const transaction = await jobRef.transaction(job => {
    if (!job) return;
    if (job.courierUid && job.courierUid !== uid) return;
    if (!['confirmed', 'ready_for_pickup', 'in_transit'].includes(job.status)) return;
    return {
      ...job,
      courierUid: uid,
      status: 'in_transit',
      acceptedAt: job.acceptedAt || Date.now(),
      updatedAt: Date.now()
    };
  }, undefined, false);

  if (!transaction.committed) {
    const current = (await jobRef.get()).val();
    if (!current) throw new HttpsError('not-found', 'Cette course n’est plus disponible.');
    if (current.courierUid && current.courierUid !== uid) {
      throw new HttpsError('already-exists', 'Cette course a déjà été acceptée par un autre livreur.');
    }
    throw new HttpsError('failed-precondition', 'Cette course ne peut pas être acceptée dans son état actuel.');
  }

  await db.ref(`orders/${orderId}`).update({
    courierUid: uid,
    status: 'in_transit',
    updatedAt: Date.now()
  });

  return { orderId, courierUid: uid, status: 'in_transit' };
});
