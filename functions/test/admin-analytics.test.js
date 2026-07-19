'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { applyDelta, buildDailyMetrics, contribution, dayKey, mergeContributionLedger, metricsFromLedger, summarizeDaily } = require('../admin-analytics-core');

test('daily aggregation replaces an order contribution without double counting', () => {
  const before = contribution({ createdAt: 1, total: 100, status: 'confirmed', paymentStatus: 'pending' });
  const after = contribution({ createdAt: 1, total: 100, status: 'delivered', paymentStatus: 'paid', payout: { platform: 15 } });
  const initial = applyDelta(null, null, before, 10);
  const delivered = applyDelta(initial, before, after, 20);
  assert.equal(delivered.orderCount, 1);
  assert.equal(delivered.deliveredCount, 1);
  assert.equal(delivered.recognizedPlatformRevenue, 15);
});

test('cancelled orders leave order volume while preserving the order count', () => {
  const before = contribution({ createdAt: 1, total: 80, status: 'confirmed' });
  const after = contribution({ createdAt: 1, total: 80, status: 'cancelled' });
  const result = applyDelta(applyDelta(null, null, before, 1), before, after, 2);
  assert.equal(result.orderCount, 1);
  assert.equal(result.grossVolume, 0);
  assert.equal(result.cancelledCount, 1);
});

test('analytics returns bounded 7 and 30 day summaries', () => {
  const now = Date.UTC(2026, 6, 19);
  const rows = [{ date: dayKey(now), orderCount: 2, grossVolume: 50 }, { date: dayKey(now - 8 * 86400000), orderCount: 1, grossVolume: 20 }];
  const result = summarizeDaily(rows, now);
  assert.equal(result.last7Days.orderCount, 2);
  assert.equal(result.last30Days.orderCount, 3);
});

test('day keys are stable UTC calendar keys', () => {
  assert.equal(dayKey(Date.UTC(2026, 6, 19, 23, 59)), '2026-07-19');
});

test('backfill isolates tenant orders and groups by UTC day', () => {
  const days = buildDailyMetrics({ local: { tenantId: 'a', createdAt: Date.UTC(2026, 6, 19), total: 10 }, foreign: { tenantId: 'b', createdAt: Date.UTC(2026, 6, 19), total: 90 } }, 'a', 1);
  assert.equal(days['2026-07-19'].orderCount, 1);
  assert.equal(days['2026-07-19'].grossVolume, 10);
});

test('backfill preserves a newer live contribution for the same order', () => {
  const current = { order1: { date: '2026-07-19', metrics: contribution({ createdAt: 1, total: 10, status: 'delivered', paymentStatus: 'paid' }), version: 20 } };
  const merged = mergeContributionLedger(current, { order1: { tenantId: 'a', createdAt: 1, updatedAt: 10, total: 10, status: 'confirmed' } }, 'a');
  assert.equal(merged.order1.version, 20);
  assert.equal(merged.order1.metrics.deliveredCount, 1);
});

test('ledger recomputation is idempotent and preserves concurrent orders', () => {
  const ledger = mergeContributionLedger({ live: { date: '2026-07-19', metrics: { orderCount: 1, grossVolume: 20 }, version: 30 } }, { historical: { tenantId: 'a', createdAt: Date.UTC(2026, 6, 19), total: 10 } }, 'a');
  const days = metricsFromLedger(ledger, 1);
  assert.equal(days['2026-07-19'].orderCount, 2);
  assert.equal(days['2026-07-19'].grossVolume, 30);
});
