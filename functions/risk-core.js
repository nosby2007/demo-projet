'use strict';

const REVIEW_STATES = new Set(['open', 'in_review', 'cleared', 'restricted', 'escalated']);
const ACTIVE_STATES = new Set(['open', 'in_review', 'restricted', 'escalated']);

const SIGNALS = Object.freeze({
  high_value: { weight: 35, label: 'Montant inhabituellement eleve' },
  payment_mismatch: { weight: 50, label: 'Statut de paiement incoherent' },
  rapid_orders: { weight: 30, label: 'Commandes rapprochees' },
  cancelled_order: { weight: 20, label: 'Commande annulee' },
  refunded_payment: { weight: 25, label: 'Paiement rembourse' }
});

function clean(value, max = 160) {
  return String(value ?? '').trim().slice(0, max);
}

function riskLevel(score) {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

function evaluateOrderRisk(order = {}, context = {}) {
  const found = [];
  const total = Number(order.total ?? order.totalAmount ?? 0);
  const status = clean(order.status, 40).toLowerCase();
  const paymentStatus = clean(order.paymentStatus, 40).toLowerCase();
  const rapidOrderCount = Math.max(0, Number(context.rapidOrderCount || 0));

  if (total >= Number(context.highValueThreshold || 250000)) found.push('high_value');
  if (['completed', 'delivered'].includes(status) && !['paid', 'settled'].includes(paymentStatus)) found.push('payment_mismatch');
  if (rapidOrderCount >= 3) found.push('rapid_orders');
  if (['cancelled', 'canceled'].includes(status)) found.push('cancelled_order');
  if (['refunded', 'chargeback'].includes(paymentStatus)) found.push('refunded_payment');

  const signals = found.map(code => ({ code, ...SIGNALS[code] }));
  const score = Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0));
  return { score, level: riskLevel(score), signals, shouldReview: score >= 30 };
}

function signalFingerprint(signals = []) {
  return signals.map(signal => signal.code).sort().join('|');
}

function riskCaseSummary(row = {}) {
  const status = REVIEW_STATES.has(row.status) ? row.status : 'open';
  return {
    id: clean(row.id),
    subjectType: clean(row.subjectType, 40),
    subjectRef: clean(row.subjectRef),
    score: Math.max(0, Math.min(100, Number(row.score || 0))),
    level: riskLevel(Number(row.score || 0)),
    signals: Array.isArray(row.signals)
      ? row.signals.map(signal => ({ code: clean(signal.code, 60), label: clean(signal.label, 120), weight: Number(signal.weight || 0) }))
      : [],
    status,
    assignedAdminUid: clean(row.assignedAdminUid),
    restricted: row.restricted === true,
    newSignalsPending: row.newSignalsPending === true,
    createdAt: Number(row.createdAt || 0),
    updatedAt: Number(row.updatedAt || row.createdAt || 0)
  };
}

function summarizeRiskCases(rows = []) {
  const cases = rows.map(riskCaseSummary).sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  return {
    cases,
    summary: {
      active: cases.filter(item => ACTIVE_STATES.has(item.status)).length,
      critical: cases.filter(item => ACTIVE_STATES.has(item.status) && item.level === 'critical').length,
      restricted: cases.filter(item => item.restricted).length,
      unassigned: cases.filter(item => ACTIVE_STATES.has(item.status) && !item.assignedAdminUid).length
    }
  };
}

module.exports = { ACTIVE_STATES, REVIEW_STATES, SIGNALS, evaluateOrderRisk, riskCaseSummary, riskLevel, signalFingerprint, summarizeRiskCases };
