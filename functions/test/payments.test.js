'use strict';

process.env.GCLOUD_PROJECT = 'sokiva-unit-test';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'sokiva-unit-test',
  databaseURL: 'https://sokiva-unit-test-default-rtdb.firebaseio.com'
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isReusablePaymentIntent,
  shouldProcessPaymentIntentEvent,
  buildPaymentSucceededUpdates,
  buildPaymentFailedUpdates
} = require('../payments');

test('reusable payment intent statuses allow re-mounting the same client secret', () => {
  assert.equal(isReusablePaymentIntent('requires_payment_method'), true);
  assert.equal(isReusablePaymentIntent('requires_confirmation'), true);
  assert.equal(isReusablePaymentIntent('requires_action'), true);
  assert.equal(isReusablePaymentIntent('succeeded'), false);
  assert.equal(isReusablePaymentIntent('canceled'), false);
});

test('only processes a webhook event when the payment intent matches the order on file', () => {
  const order = { paymentIntentId: 'pi_123' };
  assert.equal(shouldProcessPaymentIntentEvent(order, 'pi_123'), true);
  assert.equal(shouldProcessPaymentIntentEvent(order, 'pi_999'), false);
  assert.equal(shouldProcessPaymentIntentEvent(null, 'pi_123'), false);
});

test('a successful payment marks the order and every seller leg as paid', () => {
  const order = { customerUid: 'cust-1', sellerUids: { 'seller-a': true, 'seller-b': true } };
  const updates = buildPaymentSucceededUpdates(order, 'order-1', 1000);
  assert.equal(updates['orders/order-1/paymentStatus'], 'paid');
  assert.equal(updates['orders/order-1/updatedAt'], 1000);
  assert.equal(updates['customerOrders/cust-1/order-1/paymentStatus'], 'paid');
  assert.equal(updates['sellerOrders/seller-a/order-1/paymentStatus'], 'paid');
  assert.equal(updates['sellerOrders/seller-b/order-1/paymentStatus'], 'paid');
  assert.equal(updates['pendingCardPayments/order-1'], null);
});

test('a failed payment marks the order and customer index without touching seller legs', () => {
  const order = { customerUid: 'cust-1', sellerUids: { 'seller-a': true } };
  const updates = buildPaymentFailedUpdates(order, 'order-1', 2000);
  assert.equal(updates['orders/order-1/paymentStatus'], 'payment_failed');
  assert.equal(updates['customerOrders/cust-1/order-1/paymentStatus'], 'payment_failed');
  assert.equal(Object.prototype.hasOwnProperty.call(updates, 'sellerOrders/seller-a/order-1/paymentStatus'), false);
});
