'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildAdminDashboard,
  maskEmail,
  maskName,
  payoutFor,
  reconciliationRows
} = require('../admin-control-center-core');

test('admin dashboard masks the viewer email and avoids customer contact data in orders', () => {
  const dashboard = buildAdminDashboard({
    tenantId: 'lamylenoise',
    viewer: { uid: 'admin-1', email: 'owner@example.com', isSuperAdmin: true, permissions: ['*'] },
    orders: {
      order1: {
        tenantId: 'lamylenoise',
        customerName: 'Aminata Diop',
        email: 'aminata@example.com',
        phone: '+971501234567',
        address: 'Private address',
        total: 100,
        status: 'confirmed',
        paymentStatus: 'pending_cod',
        createdAt: 1000
      }
    }
  });
  assert.equal(dashboard.viewer.email, 'ow***@example.com');
  assert.equal(dashboard.operations.recentOrders[0].customerLabel, 'Aminata D.');
  assert.equal('email' in dashboard.operations.recentOrders[0], false);
  assert.equal('phone' in dashboard.operations.recentOrders[0], false);
  assert.equal('address' in dashboard.operations.recentOrders[0], false);
});

test('admin dashboard computes enterprise marketplace and finance metrics', () => {
  const dashboard = buildAdminDashboard({
    tenantId: 'lamylenoise',
    now: 200000,
    profiles: {
      seller: { tenantId: 'lamylenoise', role: 'seller', status: 'active' },
      courier: { tenantId: 'lamylenoise', role: 'courier', status: 'active' },
      disabled: { tenantId: 'lamylenoise', role: 'customer', status: 'disabled' }
    },
    orders: {
      delivered: { tenantId: 'lamylenoise', total: 200, status: 'delivered', paymentStatus: 'paid', createdAt: 100000 },
      active: { tenantId: 'lamylenoise', total: 100, status: 'in_transit', paymentStatus: 'pending_cod', createdAt: 150000 },
      cancelled: { tenantId: 'lamylenoise', total: 50, status: 'cancelled', paymentStatus: 'cancelled', createdAt: 170000 }
    },
    products: {
      low: { tenantId: 'lamylenoise', name: 'Bissap', status: 'active', stockAvailable: 2, price: 10 },
      pending: { tenantId: 'lamylenoise', name: 'Attieke', status: 'pending_review', stockAvailable: 20, price: 20 }
    },
    roleRequests: {
      request: { tenantId: 'lamylenoise', type: 'seller', status: 'pending', createdAt: 120000 }
    }
  });
  assert.equal(dashboard.executive.grossVolume, 300);
  assert.equal(dashboard.executive.expectedPlatformRevenue, 45);
  assert.equal(dashboard.executive.recognizedPlatformRevenue, 30);
  assert.equal(dashboard.marketplace.activeSellerCount, 1);
  assert.equal(dashboard.marketplace.activeCourierCount, 1);
  assert.equal(dashboard.marketplace.lowStockCount, 1);
  assert.equal(dashboard.marketplace.pendingProductCount, 1);
  assert.equal(dashboard.access.pendingCount, 1);
  assert.ok(dashboard.security.warnings.includes('low_stock_products'));
});

test('pending count includes applications awaiting a decision under every workflow status', () => {
  const dashboard = buildAdminDashboard({
    tenantId: 'lamylenoise',
    roleRequests: {
      legacy: { tenantId: 'lamylenoise', type: 'seller', status: 'pending', createdAt: 1000 },
      submitted: { tenantId: 'lamylenoise', type: 'seller', status: 'submitted', createdAt: 2000 },
      underReview: { tenantId: 'lamylenoise', type: 'courier', status: 'under_review', createdAt: 3000 },
      needsChanges: { tenantId: 'lamylenoise', type: 'seller', status: 'needs_changes', createdAt: 4000 },
      approved: { tenantId: 'lamylenoise', type: 'seller', status: 'approved', createdAt: 5000 },
      rejected: { tenantId: 'lamylenoise', type: 'seller', status: 'rejected', createdAt: 6000 }
    }
  });
  assert.equal(dashboard.access.pendingCount, 4);
  assert.equal(dashboard.access.recentRequests.length, 6);
});

test('dashboard isolates tenant data', () => {
  const dashboard = buildAdminDashboard({
    tenantId: 'lamylenoise',
    orders: {
      local: { tenantId: 'lamylenoise', total: 100, status: 'confirmed' },
      foreign: { tenantId: 'other', total: 1000, status: 'confirmed' }
    }
  });
  assert.equal(dashboard.executive.orderCount, 1);
  assert.equal(dashboard.executive.grossVolume, 100);
});

test('privacy and payout helpers are deterministic', () => {
  assert.equal(maskEmail('a@example.com'), 'a**@example.com');
  assert.equal(maskName('Jepthe Nkwanmen'), 'Jepthe N.');
  assert.deepEqual(payoutFor({ total: 100 }), { platform: 15, courier: 10, seller: 75 });
});

test('phase 2 exposes only valid administrative order actions', () => {
  const dashboard = buildAdminDashboard({ tenantId: 'lamylenoise', orders: {
    cancellable: { tenantId: 'lamylenoise', status: 'preparing', sellerStatuses: { seller: 'preparing' } },
    ready: { tenantId: 'lamylenoise', status: 'preparing', sellerStatuses: { seller: 'ready_for_pickup' } },
    delivered: { tenantId: 'lamylenoise', status: 'delivered' }
  }});
  const byId = Object.fromEntries(dashboard.operations.recentOrders.map(row => [row.id, row]));
  assert.equal(byId.cancellable.canCancel, true);
  assert.equal(byId.ready.canForceReady, true);
  assert.equal(byId.delivered.canCancel, false);
});

test('reconciliation rows flatten seller and courier earnings without profile data', () => {
  const rows = reconciliationRows({ sellers: { seller1: { order1: { amount: 75, status: 'eligible', earnedAt: 10 } } }, couriers: { courier1: { order1: { amount: 10, status: 'settled', earnedAt: 11, settlementReference: 'BANK-1' } } } }, 'lamylenoise');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].id, 'couriers:courier1:order1');
  assert.equal(rows[1].amount, 75);
  assert.equal('email' in rows[0], false);
});
