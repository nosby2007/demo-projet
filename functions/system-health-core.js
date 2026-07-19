'use strict';

const HOUR_MS = 60 * 60 * 1000;
const ACTIVE_ORDER_STATES = new Set(['pending', 'confirmed', 'preparing', 'ready_for_pickup', 'in_transit']);

function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function clean(value, max = 80) { return String(value ?? '').trim().slice(0, max); }

function statusFor(value, warning, critical) {
  if (value >= critical) return 'critical';
  if (value >= warning) return 'degraded';
  return 'healthy';
}

function oldestActiveAge(rows, now, active) {
  const timestamps = rows.filter(active).map(row => finite(row.updatedAt || row.createdAt)).filter(Boolean);
  return timestamps.length ? Math.max(0, now - Math.min(...timestamps)) : 0;
}

function buildSystemHealth(input = {}) {
  const now = finite(input.now) || Date.now();
  const orders = Object.values(input.orders || {});
  const deliveries = Object.values(input.deliveryJobs || {});
  const support = Object.values(input.supportCases || {});
  const risk = Object.values(input.riskCases || {});
  const daily = Object.values(input.dailyMetrics || {});
  const audits = Object.values(input.auditEvents || {});

  const stalledOrders = orders.filter(row => ACTIVE_ORDER_STATES.has(clean(row.status, 40)) && now - finite(row.updatedAt || row.createdAt) > 24 * HOUR_MS).length;
  const staleDeliveries = deliveries.filter(row => row.status === 'in_transit' && now - finite(row.updatedAt || row.createdAt) > 2 * HOUR_MS).length;
  const breachedSupport = support.filter(row => ['open', 'in_progress', 'escalated'].includes(row.status) && finite(row.slaDueAt) < now).length;
  const criticalRisk = risk.filter(row => ['open', 'in_review', 'escalated', 'restricted'].includes(row.status) && finite(row.score) >= 80).length;
  const latestDailyUpdate = Math.max(0, ...daily.map(row => finite(row.updatedAt)));
  const latestAuditAt = Math.max(0, ...audits.map(row => finite(row.createdAt)));

  const checks = [
    { id: 'orders', label: 'Commandes actives bloquees', value: stalledOrders, status: statusFor(stalledOrders, 1, 5) },
    { id: 'delivery', label: 'Livraisons sans progression', value: staleDeliveries, status: statusFor(staleDeliveries, 1, 3) },
    { id: 'support', label: 'SLA support depasses', value: breachedSupport, status: statusFor(breachedSupport, 1, 5) },
    { id: 'risk', label: 'Alertes risque critiques', value: criticalRisk, status: statusFor(criticalRisk, 1, 3) },
    { id: 'analytics', label: 'Fraicheur des agregats', value: latestDailyUpdate ? now - latestDailyUpdate : 0, unit: 'ms', status: latestDailyUpdate && now - latestDailyUpdate <= 36 * HOUR_MS ? 'healthy' : 'degraded' }
  ];
  const overall = checks.some(check => check.status === 'critical') ? 'critical' : checks.some(check => check.status === 'degraded') ? 'degraded' : 'healthy';
  const scannedRecords = orders.length + deliveries.length + support.length + risk.length + daily.length + audits.length;

  return {
    status: overall,
    generatedAt: now,
    checks,
    freshness: { latestDailyUpdate, latestAuditAt, oldestActiveOrderAgeMs: oldestActiveAge(orders, now, row => ACTIVE_ORDER_STATES.has(clean(row.status, 40))) },
    capacity: {
      scannedRecords,
      estimatedReadUnits: scannedRecords + 6,
      estimateOnly: true,
      billingSource: false
    }
  };
}

function telemetrySummary(row = {}) {
  return {
    id: clean(row.id, 120),
    status: ['healthy', 'degraded', 'critical'].includes(row.status) ? row.status : 'degraded',
    generatedAt: finite(row.generatedAt),
    checkCounts: {
      healthy: finite(row.checkCounts?.healthy),
      degraded: finite(row.checkCounts?.degraded),
      critical: finite(row.checkCounts?.critical)
    },
    estimatedReadUnits: finite(row.estimatedReadUnits)
  };
}

function snapshotForStorage(health, id) {
  const count = status => health.checks.filter(check => check.status === status).length;
  return { id: clean(id, 120), status: health.status, generatedAt: health.generatedAt, checkCounts: { healthy: count('healthy'), degraded: count('degraded'), critical: count('critical') }, estimatedReadUnits: health.capacity.estimatedReadUnits };
}

module.exports = { ACTIVE_ORDER_STATES, buildSystemHealth, snapshotForStorage, statusFor, telemetrySummary };
