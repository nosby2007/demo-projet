'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { ref, set, update } = require('firebase/database');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'lamylenoise-rules-test',
    database: {
      rules: readFileSync(path.join(__dirname, '../../database.rules.json'), 'utf8')
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await set(ref(db, 'profiles/customer-1'), {
      role: 'customer',
      status: 'active',
      tenantId: 'lamylenoise'
    });
    await set(ref(db, 'profiles/seller-1'), {
      role: 'seller',
      status: 'active',
      tenantId: 'lamylenoise'
    });
    await set(ref(db, 'profiles/admin-1'), {
      role: 'admin',
      status: 'active',
      tenantId: 'lamylenoise'
    });
  });
});

test('customer cannot create a financial order directly', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertFails(set(ref(db, 'orders/fake-order'), {
    customerUid: 'customer-1',
    total: 1,
    status: 'delivered',
    paymentStatus: 'paid'
  }));
});

test('seller cannot publish or modify products directly', async () => {
  const db = testEnv.authenticatedContext('seller-1').database();
  await assertFails(set(ref(db, 'products/fake-product'), {
    name: 'Produit falsifié',
    price: 1,
    category: 'epicerie',
    status: 'active',
    sellerUid: 'seller-1'
  }));
});

test('authenticated user can submit an employment application linked to their account', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertSucceeds(set(ref(db, 'roleRequests/request-1'), {
    type: 'seller',
    name: 'Aminata Diop',
    email: 'aminata@example.com',
    phone: '+971500000000',
    requesterUid: 'customer-1',
    status: 'pending'
  }));
});

test('customer cannot promote their own profile to seller', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertFails(update(ref(db, 'profiles/customer-1'), {
    role: 'seller',
    status: 'active',
    tenantId: 'lamylenoise'
  }));
});

test('admin can activate a reviewed product record', async () => {
  const db = testEnv.authenticatedContext('admin-1').database();
  await assertSucceeds(set(ref(db, 'products/product-1'), {
    name: 'Bissap',
    price: 20,
    category: 'boissons',
    status: 'active',
    sellerUid: 'seller-1',
    tenantId: 'lamylenoise'
  }));
});
