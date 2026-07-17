'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePayout,
  allocateSellerPayout,
  aggregateRequestedItems,
  allSellerLegsReady,
  isClaimableDelivery,
  isAdminTransitionAllowed,
  deliveryOtpState,
  hashDeliveryCode
} = require('../commerce');

test('15/10/75 allocation always preserves the subtotal', () => {
  const payout = calculatePayout(12345, 1500);
  assert.equal(payout.platformCents + (payout.courierCents - 1500) + payout.sellerCents, 12345);
  assert.equal(payout.courierCents, Math.round(12345 * 0.10) + 1500);
});

test('seller allocations preserve the exact seller pool despite rounding', () => {
  const groups = allocateSellerPayout([
    { sellerUid: 'a', subtotalCents: 3333 },
    { sellerUid: 'b', subtotalCents: 3333 },
    { sellerUid: 'c', subtotalCents: 3334 }
  ], 7500);
  assert.equal(groups.reduce((sum, group) => sum + group.sellerPayoutCents, 0), 7500);
});

test('duplicate cart lines are aggregated before stock validation', () => {
  const items = aggregateRequestedItems([
    { productId: 'product-1', quantity: 1 },
    { productId: 'product-1', quantity: 2 },
    { productId: 'product-2', quantity: 1 }
  ]);
  assert.deepEqual(items, [
    { productId: 'product-1', quantity: 3 },
    { productId: 'product-2', quantity: 1 }
  ]);
});

test('aggregated quantities cannot exceed the per-product limit', () => {
  assert.throws(() => aggregateRequestedItems([
    { productId: 'product-1', quantity: 60 },
    { productId: 'product-1', quantity: 40 }
  ]));
});

test('all seller legs must be ready before courier exposure', () => {
  assert.equal(allSellerLegsReady({ sellerStatuses: { a: 'ready_for_pickup', b: 'preparing' } }), false);
  assert.equal(allSellerLegsReady({ sellerStatuses: { a: 'ready_for_pickup', b: 'ready_for_pickup' } }), true);
});

test('courier claim requires matching tenant and synchronized ready states', () => {
  const order = { tenantId: 'lamylenoise', status: 'ready_for_pickup' };
  const job = { tenantId: 'lamylenoise', status: 'ready_for_pickup', courierUid: null };
  assert.equal(isClaimableDelivery(order, job, 'lamylenoise'), true);
  assert.equal(isClaimableDelivery({ ...order, status: 'cancelled' }, job, 'lamylenoise'), false);
  assert.equal(isClaimableDelivery(order, { ...job, tenantId: 'other' }, 'lamylenoise'), false);
  assert.equal(isClaimableDelivery(order, { ...job, courierUid: 'courier-2' }, 'lamylenoise'), false);
});

test('terminal orders cannot be reopened by an administrator', () => {
  assert.equal(isAdminTransitionAllowed('delivered', 'confirmed', true), false);
  assert.equal(isAdminTransitionAllowed('cancelled', 'ready_for_pickup', true), false);
  assert.equal(isAdminTransitionAllowed('refunded', 'confirmed', true), false);
  assert.equal(isAdminTransitionAllowed('preparing', 'ready_for_pickup', true), true);
  assert.equal(isAdminTransitionAllowed('preparing', 'ready_for_pickup', false), false);
  assert.equal(isAdminTransitionAllowed('confirmed', 'cancelled', false), true);
});

test('delivery OTP expires and locks after bounded attempts', () => {
  const now = Date.now();
  assert.equal(deliveryOtpState({ deliveryCodeExpiresAt: now + 1000, deliveryOtpAttempts: 0 }, now).allowed, true);
  assert.equal(deliveryOtpState({ deliveryCodeExpiresAt: now - 1, deliveryOtpAttempts: 0 }, now).reason, 'expired');
  assert.equal(deliveryOtpState({ deliveryCodeExpiresAt: now + 1000, deliveryOtpAttempts: 5 }, now).reason, 'locked');
  assert.equal(deliveryOtpState({ deliveryCodeExpiresAt: now + 1000, deliveryOtpAttempts: 2, deliveryOtpLockedAt: now }, now).reason, 'locked');
});

test('delivery codes are compared as hashes', () => {
  assert.equal(hashDeliveryCode('123456'), hashDeliveryCode('123456'));
  assert.notEqual(hashDeliveryCode('123456'), hashDeliveryCode('654321'));
});
