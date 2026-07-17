'use strict';

const { createHash } = require('node:crypto');

function toCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new TypeError('Invalid monetary value');
  return Math.round(amount * 100);
}

function fromCents(value) {
  return Math.round(Number(value || 0)) / 100;
}

function calculatePayout(subtotalCents, shippingCents = 0) {
  const platformCents = Math.round(subtotalCents * 0.15);
  const courierBaseCents = Math.round(subtotalCents * 0.10);
  const sellerCents = subtotalCents - platformCents - courierBaseCents;
  return {
    platformCents,
    courierCents: courierBaseCents + shippingCents,
    sellerCents
  };
}

function allocateSellerPayout(groups, sellerPoolCents) {
  const total = groups.reduce((sum, group) => sum + group.subtotalCents, 0);
  let allocated = 0;
  return groups.map((group, index) => {
    const amount = index === groups.length - 1
      ? sellerPoolCents - allocated
      : Math.round(sellerPoolCents * (group.subtotalCents / total));
    allocated += amount;
    return { ...group, sellerPayoutCents: amount };
  });
}

function aggregateRequestedItems(items) {
  const totals = new Map();
  for (const item of items || []) {
    const productId = String(item?.productId || '').trim();
    const quantity = Number.parseInt(item?.quantity, 10);
    if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new TypeError('Invalid product request');
    }
    const aggregated = Number(totals.get(productId) || 0) + quantity;
    if (aggregated > 99) throw new TypeError('Aggregated quantity exceeds limit');
    totals.set(productId, aggregated);
  }
  return [...totals.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

function allSellerLegsReady(order) {
  const statuses = Object.values(order?.sellerStatuses || {});
  return statuses.length > 0 && statuses.every(status => status === 'ready_for_pickup');
}

function isClaimableDelivery(order, job, tenantId) {
  return Boolean(
    order &&
    job &&
    order.tenantId === tenantId &&
    job.tenantId === tenantId &&
    order.status === 'ready_for_pickup' &&
    job.status === 'ready_for_pickup' &&
    !job.courierUid
  );
}

function isAdminTransitionAllowed(currentStatus, nextStatus, sellerLegsReady) {
  if (['delivered', 'cancelled', 'refunded'].includes(currentStatus)) return false;
  if (nextStatus === 'cancelled') {
    return ['confirmed', 'preparing', 'ready_for_pickup'].includes(currentStatus);
  }
  if (nextStatus === 'ready_for_pickup') {
    return ['confirmed', 'preparing'].includes(currentStatus) && sellerLegsReady === true;
  }
  return false;
}

function deliveryOtpState(order, now, maxAttempts = 5) {
  const attempts = Number(order?.deliveryOtpAttempts || 0);
  const expiresAt = Number(order?.deliveryCodeExpiresAt || 0);
  if (order?.deliveryOtpLockedAt || attempts >= maxAttempts) {
    return { allowed: false, reason: 'locked', attempts };
  }
  if (!expiresAt || Number(now) > expiresAt) {
    return { allowed: false, reason: 'expired', attempts };
  }
  return { allowed: true, reason: null, attempts, remaining: maxAttempts - attempts };
}

function hashDeliveryCode(code) {
  return createHash('sha256').update(String(code || '')).digest('hex');
}

module.exports = {
  toCents,
  fromCents,
  calculatePayout,
  allocateSellerPayout,
  aggregateRequestedItems,
  allSellerLegsReady,
  isClaimableDelivery,
  isAdminTransitionAllowed,
  deliveryOtpState,
  hashDeliveryCode
};
