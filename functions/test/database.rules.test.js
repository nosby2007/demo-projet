'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const {
  ref,
  set,
  update,
  get,
  query,
  orderByChild,
  equalTo
} = require('firebase/database');

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
    await set(ref(db, 'products/product-active'), {
      name: 'Bissap actif',
      price: 20,
      category: 'boissons',
      status: 'active',
      sellerUid: 'seller-1',
      tenantId: 'lamylenoise'
    });
    await set(ref(db, 'products/product-pending'), {
      name: 'Produit en attente',
      price: 30,
      category: 'epicerie',
      status: 'pending_review',
      sellerUid: 'seller-1',
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

test('admin also uses the trusted backend for product publication', async () => {
  const db = testEnv.authenticatedContext('admin-1').database();
  await assertFails(set(ref(db, 'products/admin-direct-product'), {
    name: 'Publication directe',
    price: 20,
    category: 'boissons',
    status: 'active',
    sellerUid: 'catalog',
    tenantId: 'lamylenoise'
  }));
});

test('public catalogue query can read only active products', async () => {
  const db = testEnv.unauthenticatedContext().database();
  const activeQuery = query(ref(db, 'products'), orderByChild('status'), equalTo('active'));
  const snapshot = await assertSucceeds(get(activeQuery));
  const values = snapshot.val();
  if (!values?.['product-active'] || values?.['product-pending']) {
    throw new Error('Active product query returned an unexpected catalogue result.');
  }
});

test('public cannot read the unfiltered product collection or pending submissions', async () => {
  const db = testEnv.unauthenticatedContext().database();
  await assertFails(get(ref(db, 'products')));
  const pendingQuery = query(ref(db, 'products'), orderByChild('status'), equalTo('pending_review'));
  await assertFails(get(pendingQuery));
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

test('earnings records are inaccessible to browser clients', async () => {
  const db = testEnv.authenticatedContext('seller-1').database();
  await assertFails(get(ref(db, 'earnings/lamylenoise/sellers/seller-1')));
  await assertFails(set(ref(db, 'earnings/lamylenoise/sellers/seller-1/fake'), {
    amount: 999999,
    status: 'eligible'
  }));
});
