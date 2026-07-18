'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { ref, set, update, get } = require('firebase/database');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sokiva-rules-test',
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
      role: 'customer', status: 'active', tenantId: 'lamylenoise'
    });
    await set(ref(db, 'profiles/seller-1'), {
      role: 'seller', status: 'active', tenantId: 'lamylenoise'
    });
    await set(ref(db, 'profiles/admin-1'), {
      role: 'admin', status: 'active', tenantId: 'lamylenoise'
    });
    await set(ref(db, 'profiles/owner-1'), {
      role: 'admin', status: 'active', tenantId: 'lamylenoise', isSuperAdmin: true
    });
    await set(ref(db, 'products/product-active'), {
      name: 'Bissap interne', price: 20, category: 'boissons', status: 'active',
      sellerUid: 'seller-1', tenantId: 'lamylenoise'
    });
    await set(ref(db, 'products/product-pending'), {
      name: 'Produit en attente', price: 30, category: 'epicerie', status: 'pending_review',
      sellerUid: 'seller-1', tenantId: 'lamylenoise'
    });
    await set(ref(db, 'publicCatalog/lamylenoise/product-active'), {
      id: 'product-active', tenantId: 'lamylenoise', name: 'Bissap public',
      price: 20, category: 'boissons', status: 'active'
    });
    await set(ref(db, 'publicCatalog/other-tenant/other-product'), {
      id: 'other-product', tenantId: 'other-tenant', name: 'Autre catalogue',
      price: 40, category: 'epicerie', status: 'active'
    });
  });
});

test('customer cannot create a financial order directly', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertFails(set(ref(db, 'orders/fake-order'), {
    customerUid: 'customer-1', total: 1, status: 'delivered', paymentStatus: 'paid'
  }));
});

test('seller and admin cannot publish products directly', async () => {
  const sellerDb = testEnv.authenticatedContext('seller-1').database();
  await assertFails(set(ref(sellerDb, 'products/fake-product'), {
    name: 'Produit falsifié', price: 1, category: 'epicerie', status: 'active'
  }));
  const adminDb = testEnv.authenticatedContext('admin-1').database();
  await assertFails(set(ref(adminDb, 'products/admin-product'), {
    name: 'Publication directe', price: 20, category: 'boissons', status: 'active'
  }));
});

test('internal products are never browser-readable', async () => {
  const db = testEnv.unauthenticatedContext().database();
  await assertFails(get(ref(db, 'products')));
  await assertFails(get(ref(db, 'products/product-active')));
});

test('storefront reads only its explicit tenant catalogue path', async () => {
  const db = testEnv.unauthenticatedContext().database();
  const snapshot = await assertSucceeds(get(ref(db, 'publicCatalog/lamylenoise')));
  const values = snapshot.val();
  if (!values?.['product-active'] || values?.['other-product']) {
    throw new Error('Tenant catalogue returned unexpected products.');
  }
  await assertFails(get(ref(db, 'publicCatalog')));
});

test('browser clients cannot modify public catalogue indexes', async () => {
  const db = testEnv.authenticatedContext('admin-1').database();
  await assertFails(set(ref(db, 'publicCatalog/lamylenoise/fake'), {
    name: 'Faux produit', price: 1, status: 'active'
  }));
});

test('new customer profile can use the pilot tenant or omit it', async () => {
  const withoutTenant = testEnv.authenticatedContext('new-customer-1').database();
  await assertSucceeds(set(ref(withoutTenant, 'profiles/new-customer-1'), {
    role: 'customer', status: 'active', name: 'Client Pilot'
  }));
  const pilotTenant = testEnv.authenticatedContext('new-customer-2').database();
  await assertSucceeds(set(ref(pilotTenant, 'profiles/new-customer-2'), {
    role: 'customer', status: 'active', tenantId: 'lamylenoise', name: 'Client Pilot Deux'
  }));
});

test('new customer cannot self-enroll into another tenant', async () => {
  const db = testEnv.authenticatedContext('new-customer-foreign').database();
  await assertFails(set(ref(db, 'profiles/new-customer-foreign'), {
    role: 'customer', status: 'active', tenantId: 'other-tenant', name: 'Foreign Tenant Attempt'
  }));
});

test('browser clients cannot create or change the superadmin flag', async () => {
  const newCustomerDb = testEnv.authenticatedContext('new-customer-owner').database();
  await assertFails(set(ref(newCustomerDb, 'profiles/new-customer-owner'), {
    role: 'customer', status: 'active', tenantId: 'lamylenoise', isSuperAdmin: true
  }));

  const customerDb = testEnv.authenticatedContext('customer-1').database();
  await assertFails(update(ref(customerDb, 'profiles/customer-1'), { isSuperAdmin: true }));

  const adminDb = testEnv.authenticatedContext('admin-1').database();
  await assertFails(update(ref(adminDb, 'profiles/admin-1'), { isSuperAdmin: true }));
  await assertFails(update(ref(adminDb, 'profiles/owner-1'), { isSuperAdmin: false }));
});

test('authenticated user can submit an employment application linked to their account', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertSucceeds(set(ref(db, 'roleRequests/request-1'), {
    type: 'seller', name: 'Client Test', email: 'client@example.com',
    phone: '+971500000000', requesterUid: 'customer-1', status: 'pending'
  }));
});

test('customer cannot promote their own profile to seller', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertFails(update(ref(db, 'profiles/customer-1'), {
    role: 'seller', status: 'active', tenantId: 'lamylenoise'
  }));
});

test('earnings records are inaccessible to browser clients', async () => {
  const db = testEnv.authenticatedContext('seller-1').database();
  await assertFails(get(ref(db, 'earnings/lamylenoise/sellers/seller-1')));
  await assertFails(set(ref(db, 'earnings/lamylenoise/sellers/seller-1/fake'), {
    amount: 999999, status: 'eligible'
  }));
});
