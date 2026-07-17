'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { ref, set, get, update } = require('firebase/database');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sokiva-rules-test',
    database: {
      rules: readFileSync(path.join(__dirname, '../../database.rules.json'), 'utf8')
    }
  });
});

after(async () => testEnv.cleanup());

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, 'profiles/customer-owner'), { role: 'customer', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'profiles/customer-other'), { role: 'customer', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'profiles/courier-assigned'), { role: 'courier', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'profiles/courier-other'), { role: 'courier', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'profiles/admin-same'), { role: 'admin', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'profiles/admin-other'), { role: 'admin', status: 'active', tenantId: 'other-tenant' });
    await set(ref(db, 'orders/order-1'), {
      customerUid: 'customer-owner', courierUid: 'courier-assigned', tenantId: 'lamylenoise', status: 'in_transit'
    });
    await set(ref(db, 'orderTracking/order-1'), {
      orderId: 'order-1', tenantId: 'lamylenoise', status: 'in_transit', live: true,
      destination: { latitude: 24.46, longitude: 54.38 },
      courierLocation: { latitude: 24.45, longitude: 54.37, publishedAt: 1000 }
    });
  });
});

test('order owner, assigned in-transit courier and same-tenant admin can read tracking', async () => {
  for (const uid of ['customer-owner', 'courier-assigned', 'admin-same']) {
    const db = testEnv.authenticatedContext(uid).database();
    await assertSucceeds(get(ref(db, 'orderTracking/order-1')));
  }
});

test('unrelated users and other-tenant admins cannot read tracking', async () => {
  for (const uid of ['customer-other', 'courier-other', 'admin-other']) {
    const db = testEnv.authenticatedContext(uid).database();
    await assertFails(get(ref(db, 'orderTracking/order-1')));
  }
  await assertFails(get(ref(testEnv.unauthenticatedContext().database(), 'orderTracking/order-1')));
});

test('courier tracking access ends when the order leaves in-transit status', async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await update(ref(context.database(), 'orders/order-1'), { status: 'delivered' });
  });
  await assertFails(get(ref(testEnv.authenticatedContext('courier-assigned').database(), 'orderTracking/order-1')));
  await assertSucceeds(get(ref(testEnv.authenticatedContext('customer-owner').database(), 'orderTracking/order-1')));
  await assertSucceeds(get(ref(testEnv.authenticatedContext('admin-same').database(), 'orderTracking/order-1')));
});

test('no browser role can forge or modify courier tracking', async () => {
  for (const uid of ['customer-owner', 'courier-assigned', 'admin-same']) {
    const db = testEnv.authenticatedContext(uid).database();
    await assertFails(update(ref(db, 'orderTracking/order-1'), {
      courierLocation: { latitude: 25.2, longitude: 55.2, publishedAt: Date.now() }
    }));
    await assertFails(set(ref(db, 'orderTracking/fake-order'), {
      status: 'delivered', live: false
    }));
  }
});
