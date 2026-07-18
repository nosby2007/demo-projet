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
    await set(ref(db, 'profiles/customer-1'), {
      role: 'customer', status: 'active', tenantId: 'lamylenoise', name: 'Customer'
    });
    await set(ref(db, 'profiles/seller-1'), {
      role: 'seller', status: 'active', tenantId: 'lamylenoise', name: 'Seller'
    });
    await set(ref(db, 'profiles/admin-1'), {
      role: 'admin', status: 'active', tenantId: 'lamylenoise', name: 'Admin'
    });
    await set(ref(db, 'profiles/owner-1'), {
      role: 'admin', status: 'active', tenantId: 'lamylenoise', name: 'Owner', isSuperAdmin: true
    });
  });
});

test('regular administrator cannot grant roles, disable users or move tenants directly', async () => {
  const db = testEnv.authenticatedContext('admin-1', {
    role: 'admin', isSuperAdmin: false
  }).database();
  await assertFails(update(ref(db, 'profiles/customer-1'), { role: 'admin' }));
  await assertFails(update(ref(db, 'profiles/seller-1'), { status: 'disabled' }));
  await assertFails(update(ref(db, 'profiles/seller-1'), { tenantId: 'other-tenant' }));
  await assertFails(set(ref(db, 'profiles/forged-admin'), {
    role: 'admin', status: 'active', tenantId: 'lamylenoise'
  }));
});

test('regular administrator cannot alter the owner profile', async () => {
  const db = testEnv.authenticatedContext('admin-1', {
    role: 'admin', isSuperAdmin: false
  }).database();
  await assertFails(update(ref(db, 'profiles/owner-1'), { role: 'customer' }));
  await assertFails(update(ref(db, 'profiles/owner-1'), { status: 'disabled' }));
});

test('signed superadministrator can manage ordinary profiles', async () => {
  const db = testEnv.authenticatedContext('owner-1', {
    role: 'admin', isSuperAdmin: true
  }).database();
  await assertSucceeds(update(ref(db, 'profiles/seller-1'), { status: 'disabled' }));
  await assertSucceeds(update(ref(db, 'profiles/customer-1'), { role: 'seller' }));
});

test('users may update non-authority fields only on their own existing profile', async () => {
  const db = testEnv.authenticatedContext('customer-1').database();
  await assertSucceeds(update(ref(db, 'profiles/customer-1'), { name: 'Updated Customer' }));
  await assertFails(update(ref(db, 'profiles/customer-1'), { role: 'seller' }));
  await assertFails(update(ref(db, 'profiles/customer-1'), { status: 'disabled' }));
});
