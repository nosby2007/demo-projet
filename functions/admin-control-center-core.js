'use strict';

const DEFAULT_TENANT = 'lamylenoise';
const ACTIVE_ORDER_STATUSES = new Set(['confirmed', 'preparing', 'ready_for_pickup', 'in_transit']);
const PAID_PAYMENT_STATUSES = new Set(['paid', 'collected', 'settled']);

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function entries(value) {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).map(([id, row]) => ({ id, ...(row || {}) }));
}

function belongsToTenant(row, tenantId) {
  return clean(row?.tenantId || DEFAULT_TENANT, 80) === tenantId;
}

function maskEmail(value) {
  const email = clean(value, 254).toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return '';
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${'*'.repeat(Math.max(2, local.length - visible.length))}@${domain}`;
}

function maskName(value) {
  const parts = clean(value, 120).split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Client';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[1].slice(0, 1)}.`;
}

function payoutFor(order) {
  const total = finite(order?.total);
  return {
    platform: finite(order?.payout?.platform, Math.round(total * 0.15 * 100) / 100),
    courier: finite(order?.payout?.courier, Math.round(total * 0.10 * 100) / 100),
    seller: finite(order?.payout?.seller, Math.round(total * 0.75 * 100) / 100)
  };
}

function orderSummary(order) {
  const payout = payoutFor(order);
  return {
    id: clean(order.id, 160),
    status: clean(order.status || 'confirmed', 60),
    paymentStatus: clean(order.paymentStatus || 'pending_cod', 60),
    total: finite(order.total),
    createdAt: finite(order.createdAt),
    updatedAt: finite(order.updatedAt || order.createdAt),
    emirate: clean(order.emirate, 80),
    customerLabel: maskName(order.customerName),
    sellerCount: Math.max(1, Object.keys(order.sellerUids || {}).length || finite(order.sellerCount, 1)),
    courierAssigned: Boolean(order.courierUid),
    canCancel: ['confirmed', 'preparing', 'ready_for_pickup'].includes(order.status),
    canForceReady: ['confirmed', 'preparing'].includes(order.status) && Object.values(order.sellerStatuses || {}).length > 0 && Object.values(order.sellerStatuses || {}).every(status => status === 'ready_for_pickup'),
    payout
  };
}

function roleRequestSummary(row) {
  return {
    id: clean(row.id, 160),
    type: row.type === 'courier' ? 'courier' : 'seller',
    status: clean(row.status || 'pending', 40),
    name: clean(row.name, 120),
    businessName: clean(row.businessName, 160),
    email: clean(row.email, 254).toLowerCase(),
    phone: clean(row.phone, 40),
    city: clean(row.city, 100),
    vehicle: clean(row.vehicle, 100),
    message: clean(row.message, 1000),
    requesterUid: clean(row.requesterUid, 160),
    createdAt: finite(row.createdAt),
    updatedAt: finite(row.updatedAt || row.createdAt),
    claimsSyncStatus: clean(row.claimsSyncStatus, 40),
    claimsSyncError: clean(row.claimsSyncError, 240),
    rejectionReason: row.rejectionReason ? clean(row.rejectionReason, 300) : '',
    changesRequestedReason: row.changesRequestedReason ? clean(row.changesRequestedReason, 300) : '',
    history: Array.isArray(row.history) ? row.history.slice(-8) : []
  };
}

function productSummary(row) {
  return {
    id: clean(row.id, 160),
    name: clean(row.name, 180),
    sellerName: clean(row.sellerName || row.brand, 160),
    category: clean(row.category, 100),
    status: clean(row.status || 'pending_review', 60),
    price: finite(row.price),
    stockAvailable: finite(row.stockAvailable),
    inventoryTracked: row.inventoryTracked !== false,
    createdAt: finite(row.createdAt),
    updatedAt: finite(row.updatedAt || row.createdAt)
  };
}

function sum(rows, selector) {
  return rows.reduce((total, row) => total + finite(selector(row)), 0);
}

function countBy(rows, selector) {
  return rows.reduce((result, row) => {
    const key = clean(selector(row) || 'unknown', 80) || 'unknown';
    result[key] = (result[key] || 0) + 1;
    return result;
  }, {});
}

function reconciliationRows(value, tenantId) {
  const rows = [];
  for (const group of ['sellers', 'couriers']) {
    for (const [beneficiaryUid, earnings] of Object.entries(value?.[group] || {})) {
      for (const [orderId, earning] of Object.entries(earnings || {})) {
        rows.push({ id: `${group}:${beneficiaryUid}:${orderId}`, tenantId, group,
          beneficiaryUid: clean(beneficiaryUid, 160), orderId: clean(orderId, 160),
          amount: finite(earning?.amount), currency: clean(earning?.currency || 'AED', 8),
          status: clean(earning?.status || 'eligible', 40), earnedAt: finite(earning?.earnedAt),
          settledAt: finite(earning?.settledAt), settlementReference: clean(earning?.settlementReference, 120) });
      }
    }
  }
  return rows.sort((a, b) => b.earnedAt - a.earnedAt);
}

function buildAdminDashboard(input = {}) {
  const now = finite(input.now, Date.now());
  const tenantId = clean(input.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;
  const allOrders = entries(input.orders).filter(row => belongsToTenant(row, tenantId));
  const allProfiles = entries(input.profiles).filter(row => belongsToTenant(row, tenantId));
  const allRequests = entries(input.roleRequests).filter(row => belongsToTenant(row, tenantId));
  const allProducts = entries(input.products).filter(row => belongsToTenant(row, tenantId));
  const allJobs = entries(input.deliveryJobs).filter(row => belongsToTenant(row, tenantId));

  const orders = allOrders.map(orderSummary).sort((a, b) => b.createdAt - a.createdAt);
  const requests = allRequests.map(roleRequestSummary).sort((a, b) => b.createdAt - a.createdAt);
  const products = allProducts.map(productSummary).sort((a, b) => b.updatedAt - a.updatedAt);
  const nonCancelledOrders = orders.filter(order => !['cancelled', 'refunded'].includes(order.status));
  const activeOrders = orders.filter(order => ACTIVE_ORDER_STATUSES.has(order.status));
  const deliveredOrders = orders.filter(order => order.status === 'delivered');
  const paidOrders = orders.filter(order => PAID_PAYMENT_STATUSES.has(order.paymentStatus));
  const rolling24h = orders.filter(order => order.createdAt >= now - 24 * 60 * 60 * 1000);
  const pendingRequests = requests.filter(row => row.status === 'pending');
  const claimsFailures = requests.filter(row => row.claimsSyncStatus === 'failed');
  const pendingProducts = products.filter(row => row.status === 'pending_review');
  const lowStockProducts = products.filter(row => row.inventoryTracked && row.status === 'active' && row.stockAvailable <= 5);
  const activeProfiles = allProfiles.filter(row => row.status !== 'disabled');

  const expectedPlatform = sum(nonCancelledOrders, order => order.payout.platform);
  const recognizedPlatform = sum(deliveredOrders.filter(order => PAID_PAYMENT_STATUSES.has(order.paymentStatus)), order => order.payout.platform);
  const expectedSeller = sum(nonCancelledOrders, order => order.payout.seller);
  const expectedCourier = sum(nonCancelledOrders, order => order.payout.courier);
  const grossVolume = sum(nonCancelledOrders, order => order.total);

  const warnings = [];
  for (const [key, truncated] of Object.entries(input.truncated || {})) {
    if (truncated) warnings.push(`${key}_result_limit_reached`);
  }
  if (claimsFailures.length) warnings.push('role_claims_sync_failures');
  if (lowStockProducts.length) warnings.push('low_stock_products');

  return {
    schemaVersion: 1,
    generatedAt: now,
    tenantId,
    viewer: {
      uid: clean(input.viewer?.uid, 160),
      name: clean(input.viewer?.name, 120),
      email: maskEmail(input.viewer?.email),
      role: 'admin',
      isSuperAdmin: input.viewer?.isSuperAdmin === true,
      permissions: Array.isArray(input.viewer?.permissions) ? input.viewer.permissions.slice(0, 50) : []
    },
    executive: {
      grossVolume,
      expectedPlatformRevenue: expectedPlatform,
      recognizedPlatformRevenue: recognizedPlatform,
      expectedSellerPayout: expectedSeller,
      expectedCourierPayout: expectedCourier,
      averageBasket: nonCancelledOrders.length ? grossVolume / nonCancelledOrders.length : 0,
      orderCount: orders.length,
      rolling24hOrders: rolling24h.length,
      activeOrders: activeOrders.length,
      deliveredOrders: deliveredOrders.length,
      paidOrders: paidOrders.length,
      cancellationRate: orders.length ? orders.filter(order => order.status === 'cancelled').length / orders.length : 0
    },
    operations: {
      orderStatusCounts: countBy(orders, order => order.status),
      paymentStatusCounts: countBy(orders, order => order.paymentStatus),
      deliveryJobCounts: countBy(allJobs, job => job.status),
      recentOrders: orders.slice(0, 50)
    },
    access: {
      pendingCount: pendingRequests.length,
      claimsFailureCount: claimsFailures.length,
      pendingRequests: pendingRequests.slice(0, 40),
      recentRequests: requests.slice(0, 60)
    },
    marketplace: {
      activeSellerCount: activeProfiles.filter(row => row.role === 'seller').length,
      activeCourierCount: activeProfiles.filter(row => row.role === 'courier').length,
      activeCustomerCount: activeProfiles.filter(row => row.role === 'customer').length,
      adminCount: activeProfiles.filter(row => row.role === 'admin').length,
      profileRoleCounts: countBy(activeProfiles, row => row.role),
      productStatusCounts: countBy(products, row => row.status),
      pendingProductCount: pendingProducts.length,
      lowStockCount: lowStockProducts.length,
      pendingProducts: pendingProducts.slice(0, 40),
      lowStockProducts: lowStockProducts.slice(0, 40)
    },
    security: {
      trustedSource: 'firebase_admin_callable',
      directSensitiveReadsDisabled: true,
      projectId: clean(input.projectId, 120),
      environment: clean(input.environment || 'development', 40),
      region: clean(input.region || 'me-central1', 40),
      warnings
    }
  };
}

module.exports = {
  DEFAULT_TENANT,
  buildAdminDashboard,
  maskEmail,
  maskName,
  orderSummary,
  payoutFor,
  reconciliationRows
};
