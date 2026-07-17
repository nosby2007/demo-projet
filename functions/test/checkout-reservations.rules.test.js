'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails
} = require('@firebase/rules-unit-testing');
const { ref, get, set } = require('firebase/database');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'lamylenoise-checkout-rules-test',
    database: {
      rules: readFileSync(path.join(__dirname, '../../database.rules.json'), 'utf8')
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('checkout reservation recovery records are server-only', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertFails(get(ref(db, 'checkoutReservations/order-1')));
  await assertFails(set(ref(db, 'checkoutReservations/order-1'), {
    customerUid: 'customer-1',
    tenantId: 'lamylenoise',
    expiresAt: Date.now() + 60000
  }));
});

test('checkout idempotency locks and committed results are server-only', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertFails(get(ref(db, 'checkoutIdempotency/customer-1/key-hash')));
  await assertFails(set(ref(db, 'checkoutIdempotency/customer-1/key-hash'), {
    status: 'committed',
    orderId: 'fake-order'
  }));
});
