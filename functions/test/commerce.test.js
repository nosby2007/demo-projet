'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  calculatePayout,
  allocateSellerPayout,
  allSellerLegsReady,
  isClaimableDelivery,
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

test('delivery codes are compared as hashes', () => {
  assert.equal(hashDeliveryCode('123456'), hashDeliveryCode('123456'));
  assert.notEqual(hashDeliveryCode('123456'), hashDeliveryCode('654321'));
});
