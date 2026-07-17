'use strict';

const { randomInt } = require('node:crypto');
const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { setGlobalOptions } = require('firebase-functions/v2');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const {
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
} = require('./commerce');

if (!getApps().length) initializeApp();
setGlobalOptions({ region: 'me-central1', maxInstances: 20 });

const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';
const MAX_ORDER_ITEMS = 50;
const MAX_OTP_ATTEMPTS = 5;
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

function requireAuth(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  return uid;
}

async function getProfile(uid) {
  const snapshot = await db.ref(`profiles/${uid}`).get();
  return snapshot.val() || null;
}

async function requireRole(uid, roles) {
  const profile = await getProfile(uid);
  if (!profile || !roles.includes(profile.role) || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Rôle ou compte non autorisé.');
  }
  return profile;
}

function tenantFor(profile, requestedTenant) {
  const profileTenant = clean(profile?.tenantId || DEFAULT_TENANT, 80);
  const tenantId = clean(requestedTenant || profileTenant, 80) || DEFAULT_TENANT;
  if (tenantId !== profileTenant) {
    throw new HttpsError('permission-denied', 'Organisation non autorisée.');
  }
  return tenantId;
}

function productKey(item) {
  const raw = clean(item?.productId || item?.id, 160);
  if (!raw) throw new HttpsError('invalid-argument', 'Identifiant produit manquant.');
  return /^\d+$/.test(raw) ? `catalog-${raw}` : raw;
}

function normalizedRequests(items) {
  try {
    return aggregateRequestedItems((items || []).map(item => ({
      productId: productKey(item),
      quantity: Number.parseInt(item.qty || item.quantity || 1, 10)
    })));
  } catch {
    throw new HttpsError('invalid-argument', 'Produit ou quantité invalide dans le panier.');
  }
}

function fail(code, message) {
  return { code, message };
}

function throwFailure(problem, fallback) {
  throw new HttpsError(problem?.code || 'aborted', problem?.message || fallback);
}

function ensure(root, key) {
  if (!root[key] || typeof root[key] !== 'object') root[key] = {};
  return root[key];
}

function isCatalogProduct(product) {
  return product?.source === 'catalog' || product?.sellerUid === 'catalog';
}

function sellerIdentity(product) {
  if (isCatalogProduct(product)) {
    return {
      sellerUid: 'catalog',
      sellerName: clean(product.brand || product.sellerName || 'LAMYLENOISE', 160) || 'LAMYLENOISE'
    };
  }
  return {
    sellerUid: clean(product.sellerUid, 160),
    sellerName: clean(product.sellerName || product.brand, 160)
  };
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

function releaseInventory(root, order) {
  if (order.inventoryReleased || order.inventorySettled) return;
  const products = ensure(root, 'products');
  for (const item of order.items || []) {
    const product = products[item.productId];
    if (!product || product.inventoryTracked !== true) continue;
    const qty = Number(item.quantity || 0);
    product.stockAvailable = Math.max(0, Number(product.stockAvailable || 0) + qty);
    product.stockReserved = Math.max(0, Number(product.stockReserved || 0) - qty);
    product.updatedAt = Date.now();
  }
  order.inventoryReleased = true;
}

function settleInventory(root, order) {
  if (order.inventorySettled) return;
  const products = ensure(root, 'products');
  for (const item of order.items || []) {
    const product = products[item.productId];
    if (!product || product.inventoryTracked !== true) continue;
    const qty = Number(item.quantity || 0);
    product.stockReserved = Math.max(0, Number(product.stockReserved || 0) - qty);
    product.stockSold = Number(product.stockSold || 0) + qty;
    product.updatedAt = Date.now();
  }
  order.inventorySettled = true;
}

function synchronizeOrderStatus(root, order, status, now) {
  order.status = status;
  order.updatedAt = now;
  const customerIndex = root.customerOrders?.[order.customerUid]?.[order.id];
  if (customerIndex) {
    customerIndex.status = status;
    customerIndex.paymentStatus = order.paymentStatus;
    customerIndex.updatedAt = now;
  }
}

function cancelSellerLegs(root, order, now) {
  for (const sellerUid of Object.keys(order.sellerUids || {})) {
    const sellerOrder = root.sellerOrders?.[sellerUid]?.[order.id];
    if (sellerOrder) {
      sellerOrder.status = 'cancelled';
      sellerOrder.updatedAt = now;
    }
  }
}

function customerSafeOrder(order, index) {
  const {
    deliveryCodeHash,
    deliveryOtpAttempts,
    deliveryOtpLastAttemptAt,
    deliveryOtpLockedAt,
    payout,
    ...safe
  } = order;
  return {
    ...safe,
    deliveryCode: index?.deliveryCode || null,
    deliveryCodeExpiresAt: index?.deliveryCodeExpiresAt || order.deliveryCodeExpiresAt || null
  };
}

exports.createOrderDraft = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['customer', 'admin']);
  const data = request.data || {};
  const tenantId = tenantFor(profile, data.tenantId);
  const rawItems = Array.isArray(data.items) ? data.items : [];
  if (!rawItems.length || rawItems.length > MAX_ORDER_ITEMS) {
    throw new HttpsError('invalid-argument', 'Le panier doit contenir entre 1 et 50 lignes.');
  }
  const requestedItems = normalizedRequests(rawItems);

  const emirate = clean(data.emirate, 80);
  if (!Object.prototype.hasOwnProperty.call(SHIPPING_AED, emirate)) {
    throw new HttpsError('invalid-argument', 'Zone de livraison non prise en charge.');
  }
  const paymentMethod = clean(data.paymentMethod || 'cod', 40).toLowerCase();
  if (paymentMethod !== 'cod') {
    throw new HttpsError('failed-precondition', 'Le pilote accepte uniquement le paiement à la livraison.');
  }

  const orderId = db.ref('orders').push().key;
  const deliveryCode = String(randomInt(100000, 1000000));
  const deliveryCodeHash = hashDeliveryCode(deliveryCode);
  const now = Date.now();
  const deliveryCodeExpiresAt = now + DELIVERY_CODE_TTL_MS;
  let problem = null;
  let response = null;

  const transaction = await db.ref().transaction(current => {
    problem = null;
    const root = current || {};
    const products = ensure(root, 'products');
    const resolvedItems = [];

    for (const requested of requestedItems) {
      const product = products[requested.productId];
      if (!product || product.status !== 'active') {
        problem = fail('failed-precondition', `Produit indisponible: ${requested.productId}`);
        return;
      }
      if (clean(product.tenantId || DEFAULT_TENANT, 80) !== tenantId) {
        problem = fail('permission-denied', 'Produit rattaché à une autre organisation.');
        return;
      }

      let unitPriceCents;
      try {
        unitPriceCents = toCents(product.price);
      } catch {
        problem = fail('failed-precondition', 'Prix produit invalide.');
        return;
      }
      if (unitPriceCents <= 0) {
        problem = fail('failed-precondition', 'Prix produit invalide.');
        return;
      }
      if (product.inventoryTracked === true) {
        const available = Number(product.stockAvailable || 0);
        if (!Number.isInteger(available) || available < requested.quantity) {
          problem = fail('failed-precondition', `${product.name || 'Produit'}: stock insuffisant.`);
          return;
        }
      }

      const identity = sellerIdentity(product);
      if (!identity.sellerUid) {
        problem = fail('failed-precondition', 'Vendeur produit invalide.');
        return;
      }
      resolvedItems.push({
        productId: requested.productId,
        name: clean(product.name, 240),
        image: clean(product.image, 1000),
        source: clean(product.source || 'seller', 40),
        sellerUid: identity.sellerUid,
        sellerName: identity.sellerName,
        quantity: requested.quantity,
        unitPriceCents,
        lineTotalCents: unitPriceCents * requested.quantity
      });
    }

    const subtotalCents = resolvedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
    if (subtotalCents <= 0) {
      problem = fail('failed-precondition', 'Le panier ne contient aucun montant facturable.');
      return;
    }
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
    const sellerStatuses = {};
    const sellerUids = {};
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
      deliveryCodeHash,
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

    ensure(root, 'orders')[orderId] = order;
    const customerOrders = ensure(root, 'customerOrders');
    ensure(customerOrders, uid)[orderId] = {
      id: orderId,
      tenantId,
      status: parentStatus,
      paymentStatus: 'pending_cod',
      total: order.total,
      deliveryCode,
      deliveryCodeExpiresAt,
      createdAt: now,
      updatedAt: now
    };

    const sellerOrders = ensure(root, 'sellerOrders');
    for (const group of groups) {
      const sellerRecord = {
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
      ensure(sellerOrders, group.sellerUid)[orderId] = sellerRecord;
    }

    for (const item of resolvedItems) {
      const product = products[item.productId];
      if (product.inventoryTracked === true) {
        product.stockAvailable = Number(product.stockAvailable || 0) - item.quantity;
        product.stockReserved = Number(product.stockReserved || 0) + item.quantity;
        product.updatedAt = now;
      }
    }

    if (parentStatus === 'ready_for_pickup') {
      ensure(root, 'deliveryJobs')[orderId] = deliveryJobFromOrder(order, now);
    }

    response = {
      orderId,
      status: parentStatus,
      paymentStatus: 'pending_cod',
      total: order.total,
      currency: 'AED',
      deliveryCode,
      deliveryCodeExpiresAt
    };
    return root;
  }, undefined, false);

  if (!transaction.committed) throwFailure(problem, 'La commande n’a pas pu être créée.');
  return response;
});

exports.listOrdersForRole = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['admin', 'customer', 'seller', 'courier']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  let rows = [];

  if (profile.role === 'admin') {
    const snapshot = await db.ref('orders').orderByChild('tenantId').equalTo(tenantId).limitToLast(200).get();
    rows = Object.values(snapshot.val() || {});
  } else if (profile.role === 'customer') {
    const snapshot = await db.ref('orders').orderByChild('customerUid').equalTo(uid).limitToLast(100).get();
    const indexSnapshot = await db.ref(`customerOrders/${uid}`).get();
    const indexes = indexSnapshot.val() || {};
    rows = Object.values(snapshot.val() || {})
      .filter(order => order.tenantId === tenantId)
      .map(order => customerSafeOrder(order, indexes[order.id]));
  } else if (profile.role === 'seller') {
    const snapshot = await db.ref(`sellerOrders/${uid}`).limitToLast(100).get();
    rows = Object.values(snapshot.val() || {}).filter(order => order.tenantId === tenantId);
  } else {
    const snapshot = await db.ref('deliveryJobs').orderByChild('tenantId').equalTo(tenantId).limitToLast(100).get();
    rows = Object.values(snapshot.val() || {})
      .filter(job => (job.status === 'ready_for_pickup' && !job.courierUid) || job.courierUid === uid)
      .map(job => job.courierUid === uid ? job : {
        id: job.id,
        orderId: job.orderId,
        tenantId: job.tenantId,
        emirate: job.emirate,
        sellerCount: job.sellerCount,
        status: job.status,
        courierUid: null,
        courierPayout: job.courierPayout,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt
      });
  }

  return { orders: rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)) };
});

exports.transitionOrder = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['admin', 'customer', 'seller']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const orderId = clean(request.data?.orderId, 160);
  const nextStatus = clean(request.data?.status, 60);
  if (!orderId || !nextStatus) throw new HttpsError('invalid-argument', 'Commande ou statut manquant.');

  let problem = null;
  const now = Date.now();
  const transaction = await db.ref().transaction(current => {
    problem = null;
    const root = current || {};
    const order = root.orders?.[orderId];
    if (!order) {
      problem = fail('not-found', 'Commande introuvable.');
      return;
    }
    if (order.tenantId !== tenantId) {
      problem = fail('permission-denied', 'Commande rattachée à une autre organisation.');
      return;
    }

    if (profile.role === 'seller') {
      const sellerOrder = root.sellerOrders?.[uid]?.[orderId];
      if (!sellerOrder) {
        problem = fail('permission-denied', 'Commande vendeur non autorisée.');
        return;
      }
      const allowed = (
        (sellerOrder.status === 'confirmed' && ['preparing', 'ready_for_pickup'].includes(nextStatus)) ||
        (sellerOrder.status === 'preparing' && nextStatus === 'ready_for_pickup')
      );
      if (!allowed) {
        problem = fail('failed-precondition', 'Transition vendeur non autorisée dans cet état.');
        return;
      }
      sellerOrder.status = nextStatus;
      sellerOrder.updatedAt = now;
      order.sellerStatuses = order.sellerStatuses || {};
      order.sellerStatuses[uid] = nextStatus;
      order.updatedAt = now;
      if (allSellerLegsReady(order)) {
        synchronizeOrderStatus(root, order, 'ready_for_pickup', now);
        ensure(root, 'deliveryJobs')[orderId] = deliveryJobFromOrder(order, now);
      } else if (nextStatus === 'preparing') {
        synchronizeOrderStatus(root, order, 'preparing', now);
      }
      return root;
    }

    if (profile.role === 'customer') {
      const cancellable = ['confirmed', 'preparing', 'ready_for_pickup'].includes(order.status);
      if (order.customerUid !== uid || nextStatus !== 'cancelled' || !cancellable) {
        problem = fail('permission-denied', 'Annulation non autorisée.');
        return;
      }
      releaseInventory(root, order);
      synchronizeOrderStatus(root, order, 'cancelled', now);
      cancelSellerLegs(root, order, now);
      if (root.deliveryJobs?.[orderId]) {
        root.deliveryJobs[orderId].status = 'cancelled';
        root.deliveryJobs[orderId].updatedAt = now;
      }
      return root;
    }

    const sellerReady = allSellerLegsReady(order);
    if (!isAdminTransitionAllowed(order.status, nextStatus, sellerReady)) {
      problem = fail('failed-precondition', 'Transition administrateur non autorisée dans cet état.');
      return;
    }
    if (nextStatus === 'cancelled') {
      releaseInventory(root, order);
      cancelSellerLegs(root, order, now);
      if (root.deliveryJobs?.[orderId]) {
        root.deliveryJobs[orderId].status = 'cancelled';
        root.deliveryJobs[orderId].updatedAt = now;
      }
      synchronizeOrderStatus(root, order, 'cancelled', now);
      return root;
    }

    synchronizeOrderStatus(root, order, 'ready_for_pickup', now);
    ensure(root, 'deliveryJobs')[orderId] = deliveryJobFromOrder(order, now);
    return root;
  }, undefined, false);

  if (!transaction.committed) throwFailure(problem, 'La commande n’a pas été modifiée.');
  return { orderId, status: nextStatus };
});

exports.claimDeliveryJob = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['courier']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const orderId = clean(request.data?.orderId, 160);
  if (!orderId) throw new HttpsError('invalid-argument', 'Commande manquante.');

  let problem = null;
  const now = Date.now();
  const transaction = await db.ref().transaction(current => {
    problem = null;
    const root = current || {};
    const order = root.orders?.[orderId];
    const job = root.deliveryJobs?.[orderId];
    if (!order || !job) {
      problem = fail('not-found', 'Cette course n’est plus disponible.');
      return;
    }
    if (!isClaimableDelivery(order, job, tenantId)) {
      problem = job.courierUid && job.courierUid !== uid
        ? fail('already-exists', 'Cette course a déjà été acceptée par un autre livreur.')
        : fail('failed-precondition', 'Cette course ne peut pas être acceptée dans son état actuel.');
      return;
    }
    job.courierUid = uid;
    job.status = 'in_transit';
    job.acceptedAt = now;
    job.updatedAt = now;
    order.courierUid = uid;
    synchronizeOrderStatus(root, order, 'in_transit', now);
    return root;
  }, undefined, false);

  if (!transaction.committed) throwFailure(problem, 'La course n’a pas pu être attribuée.');
  return { orderId, courierUid: uid, status: 'in_transit' };
});

exports.completeDelivery = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['courier']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const orderId = clean(request.data?.orderId, 160);
  const deliveryCode = clean(request.data?.deliveryCode, 12);
  if (!orderId || !/^\d{6}$/.test(deliveryCode)) {
    throw new HttpsError('invalid-argument', 'Commande ou code de livraison invalide.');
  }

  let problem = null;
  let deliveryCompleted = false;
  const now = Date.now();
  const transaction = await db.ref().transaction(current => {
    problem = null;
    deliveryCompleted = false;
    const root = current || {};
    const order = root.orders?.[orderId];
    const job = root.deliveryJobs?.[orderId];
    if (!order || !job) {
      problem = fail('not-found', 'Course introuvable.');
      return;
    }
    if (order.tenantId !== tenantId || job.tenantId !== tenantId || order.courierUid !== uid || job.courierUid !== uid) {
      problem = fail('permission-denied', 'Cette course ne vous est pas attribuée.');
      return;
    }
    if (order.status !== 'in_transit' || job.status !== 'in_transit') {
      problem = fail('failed-precondition', 'La course n’est pas en livraison.');
      return;
    }

    const otpState = deliveryOtpState(order, now, MAX_OTP_ATTEMPTS);
    if (!otpState.allowed) {
      problem = otpState.reason === 'locked'
        ? fail('resource-exhausted', 'Code de livraison verrouillé après trop de tentatives.')
        : fail('deadline-exceeded', 'Le code de livraison a expiré. Contactez le support.');
      return;
    }

    if (order.deliveryCodeHash !== hashDeliveryCode(deliveryCode)) {
      const attempts = Number(order.deliveryOtpAttempts || 0) + 1;
      order.deliveryOtpAttempts = attempts;
      order.deliveryOtpLastAttemptAt = now;
      order.updatedAt = now;
      if (attempts >= MAX_OTP_ATTEMPTS) {
        order.deliveryOtpLockedAt = now;
        problem = fail('resource-exhausted', 'Code incorrect. Vérification verrouillée après cinq tentatives.');
      } else {
        problem = fail('permission-denied', `Code incorrect. ${MAX_OTP_ATTEMPTS - attempts} tentative(s) restante(s).`);
      }
      return root;
    }

    settleInventory(root, order);
    order.paymentStatus = 'paid';
    order.deliveryProof = { method: 'customer_otp', verifiedAt: now, courierUid: uid };
    order.deliveryCodeHash = null;
    synchronizeOrderStatus(root, order, 'delivered', now);
    job.status = 'delivered';
    job.deliveredAt = now;
    job.updatedAt = now;

    const customerIndex = root.customerOrders?.[order.customerUid]?.[orderId];
    if (customerIndex) {
      customerIndex.deliveryCode = null;
      customerIndex.codeUsedAt = now;
    }

    const tenantEarnings = ensure(ensure(root, 'earnings'), tenantId);
    ensure(ensure(tenantEarnings, 'couriers'), uid)[orderId] = {
      orderId,
      amount: order.payout.courier,
      currency: 'AED',
      status: 'eligible',
      earnedAt: now
    };
    for (const sellerUid of Object.keys(order.sellerUids || {})) {
      const sellerOrder = root.sellerOrders?.[sellerUid]?.[orderId];
      if (sellerOrder) {
        sellerOrder.status = 'delivered';
        sellerOrder.paymentStatus = 'paid';
        sellerOrder.updatedAt = now;
        ensure(ensure(tenantEarnings, 'sellers'), sellerUid)[orderId] = {
          orderId,
          amount: sellerOrder.sellerPayout,
          currency: 'AED',
          status: 'eligible',
          earnedAt: now
        };
      }
    }
    deliveryCompleted = true;
    return root;
  }, undefined, false);

  if (!transaction.committed) throwFailure(problem, 'La livraison n’a pas pu être confirmée.');
  if (!deliveryCompleted) throwFailure(problem, 'La livraison n’a pas pu être confirmée.');
  return { orderId, status: 'delivered', paymentStatus: 'paid' };
});

exports.submitProduct = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['seller', 'admin']);
  const data = request.data || {};
  const tenantId = tenantFor(profile, data.tenantId);
  const name = clean(data.name, 240);
  const category = clean(data.category, 80);
  let price;
  try {
    price = fromCents(toCents(data.price));
  } catch {
    throw new HttpsError('invalid-argument', 'Prix produit invalide.');
  }
  const inventoryTracked = category !== 'services';
  const stockAvailable = inventoryTracked ? Number.parseInt(data.stockAvailable, 10) : 0;
  if (!name || !category || price <= 0) throw new HttpsError('invalid-argument', 'Produit incomplet.');
  if (inventoryTracked && (!Number.isInteger(stockAvailable) || stockAvailable < 0 || stockAvailable > 100000)) {
    throw new HttpsError('invalid-argument', 'Stock initial invalide.');
  }

  const productRef = db.ref('products').push();
  const productId = productRef.key;
  const now = Date.now();
  const catalogProduct = profile.role === 'admin';
  const product = {
    id: productId,
    tenantId,
    name,
    sku: clean(data.sku || productId, 100),
    brand: clean(data.brand || profile.businessName || profile.name || 'LAMYLENOISE', 160),
    category,
    price,
    image: clean(data.image, 1000),
    delivery: clean(data.delivery || 'Livraison UAE avec suivi', 240),
    sellerUid: catalogProduct ? 'catalog' : uid,
    sellerName: catalogProduct
      ? clean(data.brand || 'LAMYLENOISE', 160)
      : clean(profile.businessName || profile.name || data.brand, 160),
    source: catalogProduct ? 'catalog' : 'seller',
    inventoryTracked,
    stockAvailable,
    stockReserved: 0,
    stockSold: 0,
    status: catalogProduct ? 'active' : 'pending_review',
    createdAt: now,
    updatedAt: now
  };
  await productRef.set(product);
  return { productId, status: product.status };
});

exports.listProductsForRole = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['admin', 'seller']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const snapshot = profile.role === 'admin'
    ? await db.ref('products').orderByChild('tenantId').equalTo(tenantId).limitToLast(300).get()
    : await db.ref('products').orderByChild('sellerUid').equalTo(uid).limitToLast(200).get();
  const products = Object.entries(snapshot.val() || {})
    .map(([id, product]) => ({ id, ...product }))
    .filter(product => product.tenantId === tenantId)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return { products };
});

exports.reviewProduct = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const productId = clean(request.data?.productId, 160);
  const decision = clean(request.data?.decision, 20);
  if (!productId || !['approve', 'reject'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Produit ou décision invalide.');
  }

  let problem = null;
  const transaction = await db.ref(`products/${productId}`).transaction(product => {
    problem = null;
    if (!product) {
      problem = fail('not-found', 'Produit introuvable.');
      return;
    }
    if (product.tenantId !== tenantId) {
      problem = fail('permission-denied', 'Produit rattaché à une autre organisation.');
      return;
    }
    if (decision === 'approve' && product.inventoryTracked === true && Number(product.stockAvailable || 0) < 1) {
      problem = fail('failed-precondition', 'Ajoutez du stock avant activation.');
      return;
    }
    product.status = decision === 'approve' ? 'active' : 'rejected';
    product.reviewedBy = uid;
    product.reviewedAt = Date.now();
    product.updatedAt = Date.now();
    return product;
  }, undefined, false);
  if (!transaction.committed) throwFailure(problem, 'Le produit n’a pas été révisé.');
  return { productId, status: decision === 'approve' ? 'active' : 'rejected' };
});

exports.updateInventory = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['seller', 'admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const productId = clean(request.data?.productId, 160);
  const stockAvailable = Number.parseInt(request.data?.stockAvailable, 10);
  if (!productId || !Number.isInteger(stockAvailable) || stockAvailable < 0 || stockAvailable > 100000) {
    throw new HttpsError('invalid-argument', 'Produit ou stock invalide.');
  }

  let problem = null;
  const transaction = await db.ref(`products/${productId}`).transaction(product => {
    problem = null;
    if (!product) {
      problem = fail('not-found', 'Produit introuvable.');
      return;
    }
    if (product.tenantId !== tenantId || (profile.role !== 'admin' && product.sellerUid !== uid)) {
      problem = fail('permission-denied', 'Produit non autorisé.');
      return;
    }
    product.inventoryTracked = true;
    product.stockAvailable = stockAvailable;
    product.updatedAt = Date.now();
    return product;
  }, undefined, false);
  if (!transaction.committed) throwFailure(problem, 'Le stock n’a pas été modifié.');
  return { productId, stockAvailable };
});

exports.seedCatalogProducts = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const products = Array.isArray(request.data?.products) ? request.data.products.slice(0, 1000) : [];
  if (!products.length) throw new HttpsError('invalid-argument', 'Catalogue vide.');
  const now = Date.now();
  const updates = {};
  for (const item of products) {
    const rawId = clean(item.id, 100);
    if (!rawId) continue;
    const productId = rawId.startsWith('catalog-') ? rawId : `catalog-${rawId}`;
    updates[productId] = {
      ...item,
      id: productId,
      tenantId,
      sellerUid: 'catalog',
      sellerName: clean(item.brand || 'LAMYLENOISE', 160),
      status: 'active',
      source: 'catalog',
      inventoryTracked: false,
      updatedAt: now
    };
  }
  await db.ref('products').update(updates);
  return { imported: Object.keys(updates).length };
});

exports.approveRoleRequest = onCall(async request => {
  const adminUid = requireAuth(request);
  const adminProfile = await requireRole(adminUid, ['admin']);
  const tenantId = tenantFor(adminProfile, request.data?.tenantId);
  const requestId = clean(request.data?.requestId, 160);
  const role = clean(request.data?.role, 40);
  if (!requestId || !['seller', 'courier'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Demande ou rôle invalide.');
  }

  const requestSnapshot = await db.ref(`roleRequests/${requestId}`).get();
  const roleRequest = requestSnapshot.val();
  if (!roleRequest) throw new HttpsError('not-found', 'Demande introuvable.');
  if (!roleRequest.requesterUid) {
    throw new HttpsError('failed-precondition', 'Le candidat doit créer un compte avant approbation.');
  }
  if (clean(roleRequest.tenantId || DEFAULT_TENANT, 80) !== tenantId) {
    throw new HttpsError('permission-denied', 'Candidature rattachée à une autre organisation.');
  }
  if (roleRequest.type && roleRequest.type !== role) {
    throw new HttpsError('failed-precondition', 'Le rôle demandé ne correspond pas à la candidature.');
  }

  const candidateUid = roleRequest.requesterUid;
  const now = Date.now();
  await db.ref().update({
    [`roleRequests/${requestId}/status`]: 'approved',
    [`roleRequests/${requestId}/assignedRole`]: role,
    [`roleRequests/${requestId}/approvedBy`]: adminUid,
    [`roleRequests/${requestId}/updatedAt`]: now,
    [`profiles/${candidateUid}/role`]: role,
    [`profiles/${candidateUid}/status`]: 'active',
    [`profiles/${candidateUid}/tenantId`]: tenantId,
    [`profiles/${candidateUid}/businessName`]: clean(roleRequest.businessName, 160),
    [`profiles/${candidateUid}/updatedAt`]: now
  });
  await getAuth().setCustomUserClaims(candidateUid, { role, tenantId });
  return { uid: candidateUid, role, tenantId, activation: 'existing-account-updated' };
});
