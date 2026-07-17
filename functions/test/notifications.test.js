'use strict';

process.env.GCLOUD_PROJECT = 'sokiva-unit-test';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'sokiva-unit-test',
  databaseURL: 'https://sokiva-unit-test-default-rtdb.firebaseio.com'
});

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  notificationId,
  buildNotification,
  customerStatusSpec,
  shouldNotifyNearby,
  sellerUids
} = require('../notifications');

test('notification IDs are deterministic and safe for Realtime Database keys', () => {
  const id = notificationId('order/with.bad$key[1]', 'status/in_transit');
  assert.equal(id, notificationId('order/with.bad$key[1]', 'status/in_transit'));
  assert.equal(/[.#$\[\]\/]/.test(id), false);
  assert.ok(id.includes('status_in_transit'));
});

test('customer status specifications expose supported order milestones only', () => {
  assert.equal(customerStatusSpec('in_transit', 'order-123').type, 'courier_on_way');
  assert.equal(customerStatusSpec('delivered', 'order-123').priority, 'high');
  assert.equal(customerStatusSpec('unknown', 'order-123'), null);
});

test('notification payload does not copy customer contact or coordinates', () => {
  const order = {
    id: 'order-1',
    tenantId: 'lamylenoise',
    customerName: 'Private customer',
    email: 'private@example.com',
    phone: '+971500000000',
    address: 'Private address',
    deliveryLocation: { latitude: 24.4, longitude: 54.3 }
  };
  const notification = buildNotification(order, 'status_in_transit', 'customer', {
    type: 'courier_on_way',
    title: 'Le livreur est en route',
    body: 'Suivez votre commande.',
    priority: 'high'
  }, 1000);
  const serialized = JSON.stringify(notification);

  assert.equal(notification.orderId, 'order-1');
  assert.equal(notification.tenantId, 'lamylenoise');
  assert.equal(serialized.includes('Private customer'), false);
  assert.equal(serialized.includes('private@example.com'), false);
  assert.equal(serialized.includes('+971500000000'), false);
  assert.equal(serialized.includes('Private address'), false);
  assert.equal(serialized.includes('24.4'), false);
  assert.equal(serialized.includes('54.3'), false);
});

test('nearby alert fires only when a live transit crosses within one kilometre', () => {
  assert.equal(shouldNotifyNearby(
    { distanceRemainingKm: 1.4 },
    { status: 'in_transit', live: true, distanceRemainingKm: 0.9 }
  ), true);
  assert.equal(shouldNotifyNearby(
    { distanceRemainingKm: 0.8 },
    { status: 'in_transit', live: true, distanceRemainingKm: 0.7 }
  ), false);
  assert.equal(shouldNotifyNearby(
    { distanceRemainingKm: 1.4 },
    { status: 'delivered', live: false, distanceRemainingKm: 0.5 }
  ), false);
  assert.equal(shouldNotifyNearby(null, { status: 'in_transit', live: true, distanceRemainingKm: null }), false);
});

test('seller recipients exclude the internal catalogue account', () => {
  assert.deepEqual(
    sellerUids({ sellerUids: { 'seller-a': true, catalog: true, 'seller-b': true } }).sort(),
    ['seller-a', 'seller-b']
  );
});
