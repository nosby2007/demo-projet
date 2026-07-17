'use strict';

const { onCall } = require('firebase-functions/v2/https');
const checkout = require('./checkout-v5');

exports.createOrderDraft = onCall({
  region: 'me-central1',
  maxInstances: 20,
  timeoutSeconds: 300
}, request => checkout.createOrderDraft.run(request));

exports.cleanupExpiredCheckoutReservations = checkout.cleanupExpiredCheckoutReservations;
