'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAID = new Set(['paid', 'collected', 'settled']);

function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function round(value) { return Math.round(finite(value) * 100) / 100; }
function dayKey(timestamp) { return new Date(finite(timestamp)).toISOString().slice(0, 10); }
function payout(order) { return finite(order?.payout?.platform || finite(order?.total) * 0.15); }

function contribution(order) {
  if (!order || !order.createdAt) return null;
  const terminalLoss = ['cancelled', 'refunded'].includes(order.status);
  return {
    orderCount: 1,
    grossVolume: terminalLoss ? 0 : finite(order.total),
    deliveredCount: order.status === 'delivered' ? 1 : 0,
    cancelledCount: order.status === 'cancelled' ? 1 : 0,
    paidCount: PAID.has(order.paymentStatus) ? 1 : 0,
    recognizedPlatformRevenue: order.status === 'delivered' && PAID.has(order.paymentStatus) ? payout(order) : 0
  };
}

function applyDelta(current, before, after, now) {
  const result = { ...(current || {}) };
  for (const key of ['orderCount', 'grossVolume', 'deliveredCount', 'cancelledCount', 'paidCount', 'recognizedPlatformRevenue']) {
    result[key] = round(Math.max(0, finite(result[key]) - finite(before?.[key]) + finite(after?.[key])));
  }
  result.updatedAt = finite(now);
  return result;
}

function summarizeDaily(rows, now = Date.now()) {
  const normalized = (rows || []).map(row => ({ ...row })).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const since = days => normalized.filter(row => row.date >= dayKey(now - (days - 1) * DAY_MS));
  const summarize = series => ({
    orderCount: series.reduce((sum, row) => sum + finite(row.orderCount), 0),
    grossVolume: round(series.reduce((sum, row) => sum + finite(row.grossVolume), 0)),
    deliveredCount: series.reduce((sum, row) => sum + finite(row.deliveredCount), 0),
    cancelledCount: series.reduce((sum, row) => sum + finite(row.cancelledCount), 0),
    recognizedPlatformRevenue: round(series.reduce((sum, row) => sum + finite(row.recognizedPlatformRevenue), 0))
  });
  return { daily: normalized.slice(-30), last7Days: summarize(since(7)), last30Days: summarize(since(30)) };
}

function buildDailyMetrics(orders, tenantId, now = Date.now()) {
  const days = {};
  for (const order of Object.values(orders || {})) {
    if (!order || String(order.tenantId || 'lamylenoise') !== tenantId || !order.createdAt) continue;
    const date = dayKey(order.createdAt);
    days[date] = applyDelta(days[date], null, contribution(order), now);
  }
  return days;
}

module.exports = { applyDelta, buildDailyMetrics, contribution, dayKey, summarizeDaily };
