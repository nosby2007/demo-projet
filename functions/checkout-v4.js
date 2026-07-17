'use strict';

const { randomInt } = require('node:crypto');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const {
  toCents,
  fromCents,
  calculatePayout,
  allocateSellerPayout,
  aggregateRequestedItems,
  hashDeliveryCode
} = require('./commerce');

if (!getApps().length) initializeApp();
const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';
const MAX_ORDER_LINES = 50;
const CHECKOUT_RESERVATION_TTL_MS = 15 * 60 * 1000;
const DELIVERY_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SHIPPING_AED = Object.freeze({
  'Abu Dhabi': 0,
  Dubai: 15,
  Sharjah: 20,
  Ajman: 25,
  'Al Ain': 30,
  'Ras Al Khaimah': 35,
  Fujairah: 35,
  'Umm Al Quwain': 35
});

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function productKey(item) {
  const raw = clean(item?.productId || item?.id, 160);
  if (!raw) throw new HttpsError('invalid-argument', 'Identifiant produit manquant.');
  return /^\d+$/.test(raw) ? `catalog-${raw}` : raw;
}

function normalizeRequests(items) {
  try {
    return aggregateRequestedItems(items.map(item => ({
      productId: productKey(item),
      quantity: Number.parseInt(item.qty || item.quantity || 1, 10)
    })));
  } catch {
    throw new HttpsError('invalid-argument', 'Produit ou quantité invalide dans le panier.');
  }
}

async function requireCustomer(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  const snapshot = await db.ref(`profiles/${uid}`).get();
  const profile = snapshot.val();
  if (!profile || !['customer', 'admin'].includes(profile.role) || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Compte client non autorisé.');
  }
  return { uid, profile };
}

function tenantFor(profile, requestedTenant) {
  const profileTenant = clean(profile?.tenantId || DEFAULT_TENANT, 80);
  const tenantId = clean(requestedTenant || profileTenant, 80) || DEFAULT_TENANT;
  if (tenantId !== profileTenant) throw new HttpsError('permission-denied', 'Organisation non autorisée.');
  return tenantId;
}

function sellerIdentity(product) {
  if (product?.source === 'catalog' || product?.sellerUid === 'catalog') {
    return {
      sellerUid: 'catalog',
      sellerName: clean(product.brand || product.sellerName || 'LAMYLENOISE', 160) || 'LAMYLENOISE'
    };
  }
  const sellerUid = clean(product?.sellerUid, 160);
  if (!sellerUid) throw new HttpsError('failed-precondition', 'Vendeur produit invalide.');
  return {
    sellerUid,
    sellerName: clean(product.sellerName || product.brand, 160)
  };
}

async function reserveProduct(productId, requestedQuantity, tenantId, orderId, expiresAt) {
  let problem = null;
  const productRef = db.ref(`products/${productId}`);
  const result = await productRef.transaction(product => {
    problem = null;
    if (!product || product.status !== 'active') {
      problem = new HttpsError('failed-precondition', `Produit indisponible: ${productId}`);
      return;
    }
    if (clean(product.tenantId || DEFAULT_TENANT, 80) !== tenantId) {
      problem = new HttpsError('permission-denied', 'Produit rattaché à une autre organisation.');
      return;
    }

    let unitPriceCents;
    try {
      unitPriceCents = toCents(product.price);
    } catch {
      problem = new HttpsError('failed-precondition', 'Prix produit invalide.');
      return;
    }
    if (unitPriceCents <= 0) {
      problem = new HttpsError('failed-precondition', 'Prix produit invalide.');
      return;
    }

    product.checkoutReservations = product.checkoutReservations || {};
    if (product.checkoutReservations[orderId]) return product;

    if (product.inventoryTracked === true) {
      const available = Number(product.stockAvailable || 0);
      if (!Number.isInteger(available) || available < requestedQuantity) {
        problem = new HttpsError('failed-precondition', `${product.name || 'Produit'}: stock insuffisant.`);
        return;
      }
      product.stockAvailable = available - requestedQuantity;
      product.stockReserved = Number(product.stockReserved || 0) + requestedQuantity;
    }

    product.checkoutReservations[orderId] = {
      quantity: requestedQuantity,
      expiresAt
    };
    product.updatedAt = Date.now();
    return product;
  }, undefined, false);

  if (!result.committed) throw problem || new HttpsError('aborted', 'Réservation produit impossible.');
  const product = result.snapshot.val();
  return {
    productId,
    product,
    quantity: requestedQuantity,
    unitPriceCents: toCents(product.price)
  };
}

async function clearProductReservation(productId, orderId, releaseStock) {
  const ref = db.ref(`products/${productId}`);
  await ref.transaction(product => {
    const marker = product?.checkoutReservations?.[orderId];
    if (!product || !marker) return product;
    const quantity = Number(marker.quantity || 0);
    if (releaseStock && product.inventoryTracked === true && quantity > 0) {
      product.stockAvailable = Number(product.stockAvailable || 0) + quantity;
      product.stockReserved = Math.max(0, Number(product.stockReserved || 0) - quantity);
    }
    delete product.checkoutReservations[orderId];
    if (!Object.keys(product.checkoutReservations).length) delete product.checkoutReservations;
    product.updatedAt = Date.now();
    return product;
  }, undefined, false);
}

async function rollbackReservations(reservedProducts, orderId) {
  await Promise.allSettled(reservedProducts.map(item => clearProductReservation(item.productId, orderId, true)));
  await db.ref(`checkoutReservations/${orderId}`).remove();
}

function deliveryJobFromOrder(order, now) {
  return {
    id: order.id,
    orderId: order.id,
    tenantId: order.tenantId,
    emirate: order.emirate,
    address: order.address,
    customerName: order.customerName,
    phone: order.phone,
    sellerCount: Object.keys(order.sellerUids || {}).length,
    status: 'ready_for_pickup',
    courierUid: null,
    courierPayout: order.payout.courier,
    createdAt: now,
    updatedAt: now
  };
}

exports.createOrderDraft = onCall({ region: 'me-central1', maxInstances: 20 }, async request => {
  const { uid, profile } = await requireCustomer(request);
  const data = request.data || {};
  const tenantId = tenantFor(profile, data.tenantId);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  if (!rawItems.length || rawItems.length > MAX_ORDER_LINES) {
    throw new HttpsError('invalid-argument', 'Le panier doit contenir entre 1 et 50 lignes.');
  }
  const requestedItems = normalizeRequests(rawItems);

  const emirate = clean(data.emirate, 80);
  if (!Object.prototype.hasOwnProperty.call(SHIPPING_AED, emirate)) {
    throw new HttpsError('invalid-argument', 'Zone de livraison non prise en charge.');
  }
  if (clean(data.paymentMethod || 'cod', 40).toLowerCase() !== 'cod') {
    throw new HttpsError('failed-precondition', 'Le pilote accepte uniquement le paiement à la livraison.');
  }

  const orderId = db.ref('orders').push().key;
  const now = Date.now();
  const reservationExpiresAt = now + CHECKOUT_RESERVATION_TTL_MS;
  const deliveryCode = String(randomInt(100000, 1000000));
  const deliveryCodeExpiresAt = now + DELIVERY_CODE_TTL_MS;
  const reservedProducts = [];

  await db.ref(`checkoutReservations/${orderId}`).set({
    orderId,
    tenantId,
    customerUid: uid,
    status: 'reserving',
    items: Object.fromEntries(requestedItems.map(item => [item.productId, item.quantity])),
    createdAt: now,
    expiresAt: reservationExpiresAt
  });

  try {
    for (const item of requestedItems) {
      reservedProducts.push(await reserveProduct(
        item.productId,
        item.quantity,
        tenantId,
        orderId,
        reservationExpiresAt
      ));
    }

    const resolvedItems = reservedProducts.map(item => {
      const identity = sellerIdentity(item.product);
      return {
        productId: item.productId,
        name: clean(item.product.name, 240),
        image: clean(item.product.image, 1000),
        source: clean(item.product.source || 'seller', 40),
        sellerUid: identity.sellerUid,
        sellerName: identity.sellerName,
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        lineTotalCents: item.unitPriceCents * item.quantity
      };
    });

    const subtotalCents = resolvedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
    const shippingCents = subtotalCents >= 15000 ? 0 : SHIPPING_AED[emirate] * 100;
    const payout = calculatePayout(subtotalCents, shippingCents);
    const grouped = new Map();
    for (const item of resolvedItems) {
      const group = grouped.get(item.sellerUid) || {
        sellerUid: item.sellerUid,
        sellerName: item.sellerName,
        subtotalCents: 0,
        items: []
      };
      group.subtotalCents += item.lineTotalCents;
      group.items.push(item);
      grouped.set(item.sellerUid, group);
    }
    const groups = allocateSellerPayout([...grouped.values()], payout.sellerCents);
    const sellerUids = {};
    const sellerStatuses = {};
    for (const group of groups) {
      sellerUids[group.sellerUid] = true;
      sellerStatuses[group.sellerUid] = group.sellerUid === 'catalog' ? 'ready_for_pickup' : 'confirmed';
    }
    const parentStatus = Object.values(sellerStatuses).every(status => status === 'ready_for_pickup')
      ? 'ready_for_pickup'
      : 'confirmed';

    const order = {
      id: orderId,
      tenantId,
      customerUid: uid,
      customerName: clean(data.customerName, 160),
      email: clean(data.email || profile.email, 240),
      phone: clean(data.phone || profile.phone, 50),
      emirate,
      address: clean(data.address, 500),
      deliveryDate: clean(data.deliveryDate, 40),
      deliverySlot: clean(data.deliverySlot, 80),
      paymentMethod: 'cod',
      paymentStatus: 'pending_cod',
      status: parentStatus,
      currency: 'AED',
      sellerUids,
      sellerStatuses,
      deliveryCodeHash: hashDeliveryCode(deliveryCode),
      deliveryCodeExpiresAt,
      deliveryOtpAttempts: 0,
      items: resolvedItems.map(item => ({
        productId: item.productId,
        name: item.name,
        image: item.image,
        source: item.source,
        sellerUid: item.sellerUid,
        sellerName: item.sellerName,
        quantity: item.quantity,
        unitPrice: fromCents(item.unitPriceCents),
        lineTotal: fromCents(item.lineTotalCents)
      })),
      subtotal: fromCents(subtotalCents),
      shipping: fromCents(shippingCents),
      total: fromCents(subtotalCents + shippingCents),
      payout: {
        platform: fromCents(payout.platformCents),
        courier: fromCents(payout.courierCents),
        seller: fromCents(payout.sellerCents)
      },
      createdAt: now,
      updatedAt: now
    };

    const updates = {
      [`orders/${orderId}`]: order,
      [`customerOrders/${uid}/${orderId}`]: {
        id: orderId,
        tenantId,
        status: parentStatus,
        paymentStatus: 'pending_cod',
        total: order.total,
        deliveryCode,
        deliveryCodeExpiresAt,
        createdAt: now,
        updatedAt: now
      },
      [`checkoutReservations/${orderId}`]: null
    };

    for (const item of reservedProducts) {
      updates[`products/${item.productId}/checkoutReservations/${orderId}`] = null;
    }
    for (const group of groups) {
      updates[`sellerOrders/${group.sellerUid}/${orderId}`] = {
        id: `${orderId}_${group.sellerUid}`,
        orderId,
        tenantId,
        customerUid: uid,
        customerName: order.customerName,
        emirate,
        sellerUid: group.sellerUid,
        sellerName: group.sellerName,
        status: sellerStatuses[group.sellerUid],
        paymentStatus: 'pending_cod',
        items: group.items.map(item => ({
          productId: item.productId,
          name: item.name,
          image: item.image,
          quantity: item.quantity,
          unitPrice: fromCents(item.unitPriceCents),
          lineTotal: fromCents(item.lineTotalCents)
        })),
        subtotal: fromCents(group.subtotalCents),
        sellerPayout: fromCents(group.sellerPayoutCents),
        createdAt: now,
        updatedAt: now
      };
    }
    if (parentStatus === 'ready_for_pickup') {
      updates[`deliveryJobs/${orderId}`] = deliveryJobFromOrder(order, now);
    }

    await db.ref().update(updates);
    return {
      orderId,
      status: parentStatus,
      paymentStatus: 'pending_cod',
      total: order.total,
      currency: 'AED',
      deliveryCode,
      deliveryCodeExpiresAt
    };
  } catch (error) {
    await rollbackReservations(reservedProducts, orderId);
    throw error instanceof HttpsError
      ? error
      : new HttpsError('internal', 'La commande n’a pas pu être créée.');
  }
});

exports.cleanupExpiredCheckoutReservations = onSchedule({
  region: 'me-central1',
  schedule: 'every 15 minutes',
  timeZone: 'Asia/Dubai',
  maxInstances: 1
}, async () => {
  const now = Date.now();
  const snapshot = await db.ref('checkoutReservations')
    .orderByChild('expiresAt')
    .endAt(now)
    .limitToFirst(100)
    .get();
  const reservations = snapshot.val() || {};

  for (const [orderId, reservation] of Object.entries(reservations)) {
    const orderExists = (await db.ref(`orders/${orderId}`).get()).exists();
    const items = Object.entries(reservation.items || {}).map(([productId, quantity]) => ({
      productId,
      quantity: Number(quantity || 0)
    }));
    await Promise.allSettled(items.map(item => clearProductReservation(
      item.productId,
      orderId,
      !orderExists
    )));
    await db.ref(`checkoutReservations/${orderId}`).remove();
  }
});
