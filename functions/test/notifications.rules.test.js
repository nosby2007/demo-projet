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
    await set(ref(db, 'profiles/customer-a'), { role: 'customer', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'profiles/customer-b'), { role: 'customer', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'profiles/admin-a'), { role: 'admin', status: 'active', tenantId: 'lamylenoise' });
    await set(ref(db, 'userNotifications/customer-a/order-1_status_in_transit'), {
      id: 'order-1_status_in_transit',
      tenantId: 'lamylenoise',
      orderId: 'order-1',
      type: 'courier_on_way',
      title: 'Le livreur est en route',
      body: 'Suivez votre commande.',
      deepLink: 'customer.html?order=order-1',
      createdAt: 1000,
      readAt: null
    });
  });
});

test('authenticated owner can read only their notification inbox', async () => {
  const ownerDb = testEnv.authenticatedContext('customer-a').database();
  await assertSucceeds(get(ref(ownerDb, 'userNotifications/customer-a')));
  await assertFails(get(ref(ownerDb, 'userNotifications/customer-b')));
});

test('other users, admins and unauthenticated clients cannot read an owner inbox', async () => {
  for (const uid of ['customer-b', 'admin-a']) {
    const db = testEnv.authenticatedContext(uid).database();
    await assertFails(get(ref(db, 'userNotifications/customer-a')));
  }
  await assertFails(get(ref(testEnv.unauthenticatedContext().database(), 'userNotifications/customer-a')));
});

test('all browser roles are denied direct notification writes and read-state changes', async () => {
  for (const uid of ['customer-a', 'customer-b', 'admin-a']) {
    const db = testEnv.authenticatedContext(uid).database();
    await assertFails(update(ref(db, 'userNotifications/customer-a/order-1_status_in_transit'), {
      readAt: Date.now()
    }));
    await assertFails(set(ref(db, `userNotifications/${uid}/forged`), {
      id: 'forged',
      title: 'Fake notification',
      createdAt: Date.now()
    }));
  }
});
