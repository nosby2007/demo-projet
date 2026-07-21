'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall, onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const { toCents } = require('./commerce');
const { cancelOrderInternal } = require('./marketplace-v3');

if (!getApps().length) initializeApp();
const db = getDatabase();

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
const REUSABLE_PAYMENT_INTENT_STATUSES = new Set(['requires_payment_method', 'requires_confirmation', 'requires_action']);

let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const Stripe = require('stripe');
    stripeClient = new Stripe(STRIPE_SECRET_KEY.value());
  }
  return stripeClient;
}

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function isReusablePaymentIntent(status) {
  return REUSABLE_PAYMENT_INTENT_STATUSES.has(status);
}

function shouldProcessPaymentIntentEvent(order, paymentIntentId) {
  return Boolean(order) && order.paymentIntentId === paymentIntentId;
}

function buildPaymentSucceededUpdates(order, orderId, now) {
  const updates = {
    [`orders/${orderId}/paymentStatus`]: 'paid',
    [`orders/${orderId}/updatedAt`]: now,
    [`customerOrders/${order.customerUid}/${orderId}/paymentStatus`]: 'paid',
    [`customerOrders/${order.customerUid}/${orderId}/updatedAt`]: now,
    [`pendingCardPayments/${orderId}`]: null
  };
  for (const sellerUid of Object.keys(order.sellerUids || {})) {
    updates[`sellerOrders/${sellerUid}/${orderId}/paymentStatus`] = 'paid';
    updates[`sellerOrders/${sellerUid}/${orderId}/updatedAt`] = now;
  }
  return updates;
}

function buildPaymentFailedUpdates(order, orderId, now) {
  return {
    [`orders/${orderId}/paymentStatus`]: 'payment_failed',
    [`orders/${orderId}/updatedAt`]: now,
    [`customerOrders/${order.customerUid}/${orderId}/paymentStatus`]: 'payment_failed',
    [`customerOrders/${order.customerUid}/${orderId}/updatedAt`]: now
  };
}

exports.createPaymentIntent = onCall({
  region: 'me-central1',
  maxInstances: 20,
  secrets: [STRIPE_SECRET_KEY]
}, async request => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');

  const orderId = clean(request.data?.orderId, 160);
  if (!orderId) throw new HttpsError('invalid-argument', 'Commande manquante.');

  const snapshot = await db.ref(`orders/${orderId}`).get();
  const order = snapshot.val();
  if (!order) throw new HttpsError('not-found', 'Commande introuvable.');
  if (order.customerUid !== uid) throw new HttpsError('permission-denied', 'Commande non autorisée.');
  if (order.paymentMethod !== 'card') {
    throw new HttpsError('failed-precondition', 'Cette commande n’utilise pas le paiement par carte.');
  }
  if (!['pending_card', 'payment_failed'].includes(order.paymentStatus)) {
    throw new HttpsError('failed-precondition', 'Cette commande n’attend plus de paiement par carte.');
  }

  const stripe = getStripe();
  const amount = toCents(order.total);

  if (order.paymentIntentId) {
    const existing = await stripe.paymentIntents.retrieve(order.paymentIntentId);
    if (isReusablePaymentIntent(existing.status)) {
      return { clientSecret: existing.client_secret };
    }
    if (existing.status === 'succeeded') {
      throw new HttpsError('failed-precondition', 'Cette commande est déjà payée.');
    }
  }

  const intent = await stripe.paymentIntents.create({
    amount,
    currency: 'aed',
    automatic_payment_methods: { enabled: true },
    metadata: { orderId, tenantId: clean(order.tenantId, 80) }
  });

  await db.ref(`orders/${orderId}/paymentIntentId`).set(intent.id);
  return { clientSecret: intent.client_secret };
});

async function handlePaymentIntentEvent(eventType, paymentIntent) {
  const orderId = clean(paymentIntent.metadata?.orderId, 160);
  if (!orderId) return;

  const snapshot = await db.ref(`orders/${orderId}`).get();
  const order = snapshot.val();
  if (!shouldProcessPaymentIntentEvent(order, paymentIntent.id) || order.paymentStatus === 'paid') return;

  const now = Date.now();
  if (eventType === 'payment_intent.succeeded') {
    await db.ref().update(buildPaymentSucceededUpdates(order, orderId, now));
  } else if (eventType === 'payment_intent.payment_failed') {
    await db.ref().update(buildPaymentFailedUpdates(order, orderId, now));
  }
}

exports.stripeWebhook = onRequest({
  region: 'me-central1',
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]
}, async (req, res) => {
  let event;
  try {
    event = getStripe().webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
  } catch (error) {
    console.error('Stripe webhook signature verification failed.', error.message);
    res.status(400).send('Signature invalide.');
    return;
  }

  try {
    if (event.type === 'payment_intent.succeeded' || event.type === 'payment_intent.payment_failed') {
      await handlePaymentIntentEvent(event.type, event.data.object);
    }
    res.status(200).send({ received: true });
  } catch (error) {
    console.error('Stripe webhook handling failed.', event.type, error);
    res.status(500).send('Erreur interne.');
  }
});

exports.cleanupAbandonedCardOrders = onSchedule({
  region: 'me-central1',
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Dubai',
  maxInstances: 1
}, async () => {
  const now = Date.now();
  const snapshot = await db.ref('pendingCardPayments')
    .orderByChild('expiresAt')
    .endAt(now)
    .limitToFirst(100)
    .get();
  const pending = snapshot.val() || {};

  for (const orderId of Object.keys(pending)) {
    const orderSnapshot = await db.ref(`orders/${orderId}`).get();
    const order = orderSnapshot.val();
    if (order && ['pending_card', 'payment_failed'].includes(order.paymentStatus)) {
      await cancelOrderInternal(orderId, 'payment_abandoned').catch(error => {
        console.error('Failed to cancel abandoned card order.', orderId, error);
      });
    }
    await db.ref(`pendingCardPayments/${orderId}`).remove();
  }
});

exports.isReusablePaymentIntent = isReusablePaymentIntent;
exports.shouldProcessPaymentIntentEvent = shouldProcessPaymentIntentEvent;
exports.buildPaymentSucceededUpdates = buildPaymentSucceededUpdates;
exports.buildPaymentFailedUpdates = buildPaymentFailedUpdates;
