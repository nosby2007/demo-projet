'use strict';

const { HttpsError, onCall } = require('firebase-functions/v2/https');
const checkout = require('./checkout-v5');

exports.createOrderDraft = onCall({
  region: 'me-central1',
  maxInstances: 20,
  timeoutSeconds: 300
}, request => {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  }
  if (request.auth.token?.email_verified !== true) {
    throw new HttpsError('failed-precondition', 'Vérifiez votre adresse email avant de passer une commande.');
  }
  return checkout.createOrderDraft.run(request);
});

exports.cleanupExpiredCheckoutReservations = checkout.cleanupExpiredCheckoutReservations;
