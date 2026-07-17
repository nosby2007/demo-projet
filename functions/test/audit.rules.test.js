'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before, after, beforeEach } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails
} = require('@firebase/rules-unit-testing');
const { ref, set, update, remove, get } = require('firebase/database');

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
    await set(ref(db, 'profiles/admin-1'), {
      role: 'admin', status: 'active', tenantId: 'lamylenoise'
    });
    await set(ref(db, 'profiles/customer-1'), {
      role: 'customer', status: 'active', tenantId: 'lamylenoise'
    });
    await set(ref(db, 'auditLogs/lamylenoise/event-1'), {
      id: 'event-1',
      tenantId: 'lamylenoise',
      action: 'order.status_changed',
      entityType: 'order',
      entityId: 'order-1',
      actorUid: 'admin-1',
      actorType: 'inferred',
      source: 'rtdb_trigger',
      outcome: 'success',
      createdAt: 1000
    });
  });
});

test('audit records cannot be read directly by customers or administrators', async () => {
  const customerDb = testEnv.authenticatedContext('customer-1').database();
  const adminDb = testEnv.authenticatedContext('admin-1').database();
  await assertFails(get(ref(customerDb, 'auditLogs/lamylenoise')));
  await assertFails(get(ref(adminDb, 'auditLogs/lamylenoise/event-1')));
});

test('browser clients cannot create, modify or delete audit records', async () => {
  for (const uid of ['customer-1', 'admin-1']) {
    const db = testEnv.authenticatedContext(uid).database();
    await assertFails(set(ref(db, 'auditLogs/lamylenoise/fake-event'), {
      action: 'forged.audit', createdAt: Date.now()
    }));
    await assertFails(update(ref(db, 'auditLogs/lamylenoise/event-1'), {
      outcome: 'tampered'
    }));
    await assertFails(remove(ref(db, 'auditLogs/lamylenoise/event-1')));
  }
});
