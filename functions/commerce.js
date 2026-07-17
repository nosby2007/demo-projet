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

function hashDeliveryCode(code) {
  return createHash('sha256').update(String(code || '')).digest('hex');
}

module.exports = {
  toCents,
  fromCents,
  calculatePayout,
  allocateSellerPayout,
  allSellerLegsReady,
  isClaimableDelivery,
  hashDeliveryCode
};
