'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeAuditValue } = require('../audit');

test('audit snapshots redact delivery coordinates and contact details', () => {
  const sanitized = sanitizeAuditValue({
    status: 'preparing',
    total: 120,
    address: 'Private address',
    phone: '+971500000000',
    deliveryLocation: {
      latitude: 24.4539,
      longitude: 54.3773,
      accuracyMeters: 10
    }
  });

  assert.equal(sanitized.status, 'preparing');
  assert.equal(sanitized.total, 120);
  assert.equal(sanitized.address, '[REDACTED]');
  assert.equal(sanitized.phone, '[REDACTED]');
  assert.equal(sanitized.deliveryLocation, '[REDACTED]');
  assert.equal(JSON.stringify(sanitized).includes('24.4539'), false);
  assert.equal(JSON.stringify(sanitized).includes('54.3773'), false);
});
