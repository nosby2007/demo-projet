'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateOrderRisk, riskCaseSummary, riskLevel, signalFingerprint, summarizeRiskCases } = require('../risk-core');

test('risk levels use deterministic thresholds', () => {
  assert.deepEqual([riskLevel(0), riskLevel(30), riskLevel(60), riskLevel(80)], ['low', 'medium', 'high', 'critical']);
});

test('high value and payment mismatch produce explainable critical risk', () => {
  const result = evaluateOrderRisk({ total: 300000, status: 'delivered', paymentStatus: 'pending' });
  assert.equal(result.score, 85);
  assert.equal(result.level, 'critical');
  assert.deepEqual(result.signals.map(signal => signal.code), ['high_value', 'payment_mismatch']);
});

test('rapid orders cross review threshold', () => {
  const result = evaluateOrderRisk({ total: 1000, status: 'pending' }, { rapidOrderCount: 3 });
  assert.equal(result.shouldReview, true);
  assert.equal(result.score, 30);
});

test('signal fingerprint is stable regardless of order', () => {
  assert.equal(signalFingerprint([{ code: 'rapid_orders' }, { code: 'high_value' }]), 'high_value|rapid_orders');
});

test('queue summaries omit reasons and personal data', () => {
  const item = riskCaseSummary({ id: 'r1', subjectType: 'order', subjectRef: 'o1', score: 80, status: 'open', lastDecisionReason: 'private', email: 'private@example.test' });
  assert.equal('lastDecisionReason' in item, false);
  assert.equal('email' in item, false);
  const queue = summarizeRiskCases([item]);
  assert.deepEqual(queue.summary, { active: 1, critical: 1, restricted: 0, unassigned: 1 });
});
