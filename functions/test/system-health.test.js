'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSystemHealth, snapshotForStorage, statusFor, telemetrySummary } = require('../system-health-core');

test('threshold status is deterministic', () => { assert.deepEqual([statusFor(0, 1, 3), statusFor(1, 1, 3), statusFor(3, 1, 3)], ['healthy', 'degraded', 'critical']); });
test('healthy snapshot reports estimated rather than billed reads', () => {
  const health = buildSystemHealth({ now: 1000, dailyMetrics: { day: { updatedAt: 900 } } });
  assert.equal(health.status, 'healthy'); assert.equal(health.capacity.estimateOnly, true); assert.equal(health.capacity.billingSource, false);
});
test('stalled operations and critical risk affect overall health', () => {
  const now = 200 * 60 * 60 * 1000;
  const health = buildSystemHealth({ now, dailyMetrics: { day: { updatedAt: now } }, orders: Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i, { status: 'pending', updatedAt: 1 }])), riskCases: { r: { status: 'open', score: 90 } } });
  assert.equal(health.status, 'critical'); assert.equal(health.checks.find(c => c.id === 'orders').value, 5);
});
test('tenant telemetry storage excludes raw operational records', () => {
  const health = buildSystemHealth({ now: 1000, dailyMetrics: { day: { updatedAt: 900 } }, orders: { secret: { status: 'delivered', customerUid: 'private' } } });
  const stored = snapshotForStorage(health, 'sample'); assert.equal('orders' in stored, false); assert.equal(stored.id, 'sample');
});
test('history summaries expose only bounded aggregate fields', () => {
  const row = telemetrySummary({ id: 'x', status: 'critical', generatedAt: 10, estimatedReadUnits: 20, raw: 'secret' }); assert.equal('raw' in row, false); assert.equal(row.estimatedReadUnits, 20);
});
