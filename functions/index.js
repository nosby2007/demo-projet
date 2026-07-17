'use strict';

const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { setGlobalOptions } = require('firebase-functions/v2');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

initializeApp();
setGlobalOptions({ region: 'me-central1', maxInstances: 20 });

const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';
const PLATFORM_RATE = 0.15;
const COURIER_RATE = 0.10;
const MAX_ORDER_ITEMS = 50;

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

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  }
  return request.auth.uid;
}

function cleanString(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function moneyToCents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new HttpsError('failed-precondition', 'Montant produit invalide.');
  }
  return Math.round(amount * 100);
}

function centsToMoney(value) {
  return Math.round(Number(value || 0)) / 100;
}

function normalizeQuantity(value) {
  const quantity = Number.parseInt(value, 10);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    throw new HttpsError('invalid-argument', 'Quantité invalide.');
  }
  return quantity;
}

async function getProfile(uid) {
  const snapshot = await db.ref(`profiles/${uid}`).get();
  return snapshot.val() || null;
}

async function requireRole(uid, allowedRoles) {
  const profile = await getProfile(uid);
  if (!profile || !allowedRoles.includes(profile.role) || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Rôle ou compte non autorisé.');
  }
  return profile;
}

function tenantFor(profile, requestedTenant) {
  const profileTenant = cleanString(profile?.tenantId || DEFAULT_TENANT, 80);
  const tenantId = cleanString(requestedTenant || profileTenant, 80);
  if (tenantId !== profileTenant && profile?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Tenant non autorisé.');
  }
  return tenantId || DEFAULT_TENANT;
}

function requestedProductKey(item) {
  const raw = cleanString(item?.productId || item?.id, 160);
  if (!raw) throw new HttpsError('invalid-argument', 'Identifiant produit manquant.');
  return /^\d+$/.test(raw) ? `catalog-${raw}` : raw;
}

function paymentState(method) {
  if (method === 'cod') {
    return { status: 'confirmed', paymentStatus: 'pending_cod' };
  }
  return { status: 'payment_pending', paymentStatus: 'pending' };
}

exports.createOrderDraft = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['customer', 'admin']);
  const data = request.data || {};
  const tenantId = tenantFor(profile, data.tenantId);
  const requestedItems = Array.isArray(data.items) ? data.items : [];

  if (!requestedItems.length || requestedItems.length > MAX_ORDER_ITEMS) {
    throw new HttpsError('invalid-argument', 'Le panier doit contenir entre 1 et 50 articles.');
  }

  const emirate = cleanString(data.emirate, 80);
  if (!Object.prototype.hasOwnProperty.call(SHIPPING_AED, emirate)) {
    throw new HttpsError('invalid-argument', 'Zone de livraison non prise en charge.');
  }

  const paymentMethod = cleanString(data.paymentMethod || 'cod', 40).toLowerCase();
  const allowedPaymentMethods = ['cod', 'card', 'apple', 'tabby', 'tamara'];
  if (!allowedPaymentMethods.includes(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'Mode de paiement invalide.');
  }

  const resolvedItems = await Promise.all(requestedItems.map(async requested => {
    const productId = requestedProductKey(requested);
    const quantity = normalizeQuantity(requested.qty || requested.quantity || 1);
    const snapshot = await db.ref(`products/${productId}`).get();
    const product = snapshot.val();

    if (!product || product.status !== 'active') {
      throw new HttpsError('failed-precondition', `Produit indisponible: ${productId}`);
    }
    if (cleanString(product.tenantId || DEFAULT_TENANT, 80) !== tenantId) {
      throw new HttpsError('permission-denied', 'Produit rattaché à une autre organisation.');
    }

    const unitPriceCents = moneyToCents(product.price);
    const sellerUid = cleanString(product.sellerUid || 'catalog', 160);
    return {
      productId,
      name: cleanString(product.name, 240),
      image: cleanString(product.image, 1000),
      sellerUid,
      sellerName: cleanString(product.sellerName || product.brand || 'LAMYLENOISE', 160),
      quantity,
      unitPriceCents,
      lineTotalCents: unitPriceCents * quantity
    };
  }));

  const subtotalCents = resolvedItems.reduce((sum, item) => sum + item.lineTotalCents, 0);
  const shippingCents = subtotalCents >= 15000 ? 0 : SHIPPING_AED[emirate] * 100;
  const totalCents = subtotalCents + shippingCents;
  const platformCents = Math.round(subtotalCents * PLATFORM_RATE);
  const baseCourierCents = Math.round(subtotalCents * COURIER_RATE);
  const sellerPoolCents = subtotalCents - platformCents - baseCourierCents;
  const courierCents = baseCourierCents + shippingCents;
  const state = paymentState(paymentMethod);
  const orderRef = db.ref('orders').push();
  const orderId = orderRef.key;
  const now = Date.now();

  const sellerGroups = new Map();
  for (const item of resolvedItems) {
    const group = sellerGroups.get(item.sellerUid) || {
      sellerUid: item.sellerUid,
      sellerName: item.sellerName,
      subtotalCents: 0,
      items: []
    };
    group.subtotalCents += item.lineTotalCents;
    group.items.push(item);
    sellerGroups.set(item.sellerUid, group);
  }

  let allocatedSellerCents = 0;
  const sellerOrders = {};
  const groups = [...sellerGroups.values()];
  groups.forEach((group, index) => {
    const groupSellerCents = index === groups.length - 1
      ? sellerPoolCents - allocatedSellerCents
      : Math.round(sellerPoolCents * (group.subtotalCents / subtotalCents));
    allocatedSellerCents += groupSellerCents;
    sellerOrders[group.sellerUid] = {
      id: `${orderId}_${group.sellerUid}`,
      orderId,
      tenantId,
      customerUid: uid,
      customerName: cleanString(data.customerName, 160),
      phone: cleanString(data.phone, 50),
      emirate,
      address: cleanString(data.address, 500),
      sellerUid: group.sellerUid,
      sellerName: group.sellerName,
      status: state.status,
      paymentStatus: state.paymentStatus,
      items: group.items.map(item => ({
        productId: item.productId,
        name: item.name,
        image: item.image,
        quantity: item.quantity,
        unitPrice: centsToMoney(item.unitPriceCents),
        lineTotal: centsToMoney(item.lineTotalCents)
      })),
      subtotal: centsToMoney(group.subtotalCents),
      sellerPayout: centsToMoney(groupSellerCents),
      createdAt: now,
      updatedAt: now
    };
  });

  const order = {
    id: orderId,
    tenantId,
    customerUid: uid,
    customerName: cleanString(data.customerName, 160),
    email: cleanString(data.email || profile.email, 240),
    phone: cleanString(data.phone || profile.phone, 50),
    emirate,
    address: cleanString(data.address, 500),
    deliveryDate: cleanString(data.deliveryDate, 40),
    deliverySlot: cleanString(data.deliverySlot, 80),
    paymentMethod,
    paymentStatus: state.paymentStatus,
    status: state.status,
    currency: 'AED',
    items: resolvedItems.map(item => ({
      productId: item.productId,
      name: item.name,
      image: item.image,
      sellerUid: item.sellerUid,
      sellerName: item.sellerName,
      quantity: item.quantity,
      unitPrice: centsToMoney(item.unitPriceCents),
      lineTotal: centsToMoney(item.lineTotalCents)
    })),
    sellerUids: Object.fromEntries(groups.map(group => [group.sellerUid, true])),
    sellerOrders,
    subtotal: centsToMoney(subtotalCents),
    shipping: centsToMoney(shippingCents),
    total: centsToMoney(totalCents),
    payout: {
      platform: centsToMoney(platformCents),
      courier: centsToMoney(courierCents),
      seller: centsToMoney(sellerPoolCents)
    },
    createdAt: now,
    updatedAt: now
  };

  const updates = {
    [`orders/${orderId}`]: order,
    [`customerOrders/${uid}/${orderId}`]: {
      id: orderId,
      tenantId,
      status: state.status,
      paymentStatus: state.paymentStatus,
      total: order.total,
      createdAt: now
    }
  };

  for (const [sellerUid, sellerOrder] of Object.entries(sellerOrders)) {
    updates[`sellerOrders/${sellerUid}/${orderId}`] = sellerOrder;
  }

  if (paymentMethod === 'cod') {
    updates[`deliveryJobs/${orderId}`] = {
      id: orderId,
      tenantId,
      customerName: order.customerName,
      phone: order.phone,
      emirate,
      address: order.address,
      status: 'confirmed',
      courierUid: null,
      courierPayout: order.payout.courier,
      createdAt: now,
      updatedAt: now
    };
  }

  await db.ref().update(updates);
  return {
    orderId,
    status: state.status,
    paymentStatus: state.paymentStatus,
    total: order.total,
    currency: 'AED'
  };
});

exports.listOrdersForRole = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['admin', 'customer', 'seller', 'courier']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  let values = [];

  if (profile.role === 'admin') {
    const snapshot = await db.ref('orders').orderByChild('tenantId').equalTo(tenantId).limitToLast(200).get();
    values = Object.values(snapshot.val() || {});
  } else if (profile.role === 'customer') {
    const snapshot = await db.ref('orders').orderByChild('customerUid').equalTo(uid).limitToLast(100).get();
    values = Object.values(snapshot.val() || {}).filter(order => order.tenantId === tenantId);
  } else if (profile.role === 'seller') {
    const snapshot = await db.ref(`sellerOrders/${uid}`).limitToLast(100).get();
    values = Object.values(snapshot.val() || {}).filter(order => order.tenantId === tenantId);
  } else {
    const snapshot = await db.ref('deliveryJobs').orderByChild('tenantId').equalTo(tenantId).limitToLast(100).get();
    values = Object.values(snapshot.val() || {}).filter(job => !job.courierUid || job.courierUid === uid);
  }

  return { orders: values.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)) };
});

exports.transitionOrder = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['admin', 'customer', 'seller', 'courier']);
  const orderId = cleanString(request.data?.orderId, 160);
  const nextStatus = cleanString(request.data?.status, 60);
  if (!orderId || !nextStatus) throw new HttpsError('invalid-argument', 'Commande ou statut manquant.');

  const orderSnapshot = await db.ref(`orders/${orderId}`).get();
  const order = orderSnapshot.val();
  if (!order) throw new HttpsError('not-found', 'Commande introuvable.');

  const now = Date.now();
  const updates = {};
  const adminStatuses = ['payment_pending', 'confirmed', 'preparing', 'ready_for_pickup', 'in_transit', 'delivered', 'cancelled', 'refunded'];

  if (profile.role === 'admin') {
    if (!adminStatuses.includes(nextStatus)) throw new HttpsError('invalid-argument', 'Transition non autorisée.');
    updates[`orders/${orderId}/status`] = nextStatus;
    updates[`orders/${orderId}/updatedAt`] = now;
    if (nextStatus === 'confirmed' && !order.courierUid) {
      updates[`deliveryJobs/${orderId}`] = {
        id: orderId,
        tenantId: order.tenantId || DEFAULT_TENANT,
        customerName: order.customerName || '',
        phone: order.phone || '',
        emirate: order.emirate || '',
        address: order.address || '',
        status: 'confirmed',
        courierUid: null,
        courierPayout: order.payout?.courier || 0,
        createdAt: order.createdAt || now,
        updatedAt: now
      };
    } else if (order.courierUid || nextStatus !== 'payment_pending') {
      updates[`deliveryJobs/${orderId}/status`] = nextStatus;
      updates[`deliveryJobs/${orderId}/updatedAt`] = now;
    }
  } else if (profile.role === 'courier') {
    const jobSnapshot = await db.ref(`deliveryJobs/${orderId}`).get();
    const job = jobSnapshot.val();
    if (!job) throw new HttpsError('not-found', 'Course indisponible.');
    if (nextStatus === 'in_transit') {
      if (job.courierUid && job.courierUid !== uid) throw new HttpsError('already-exists', 'Course déjà attribuée.');
      updates[`deliveryJobs/${orderId}/courierUid`] = uid;
      updates[`orders/${orderId}/courierUid`] = uid;
    } else if (nextStatus === 'delivered') {
      if (job.courierUid !== uid) throw new HttpsError('permission-denied', 'Cette course ne vous est pas attribuée.');
    } else {
      throw new HttpsError('permission-denied', 'Transition livreur non autorisée.');
    }
    updates[`deliveryJobs/${orderId}/status`] = nextStatus;
    updates[`deliveryJobs/${orderId}/updatedAt`] = now;
    updates[`orders/${orderId}/status`] = nextStatus;
    updates[`orders/${orderId}/updatedAt`] = now;
  } else if (profile.role === 'seller') {
    const sellerOrderSnapshot = await db.ref(`sellerOrders/${uid}/${orderId}`).get();
    if (!sellerOrderSnapshot.exists()) throw new HttpsError('permission-denied', 'Commande vendeur non autorisée.');
    if (!['preparing', 'ready_for_pickup'].includes(nextStatus)) {
      throw new HttpsError('permission-denied', 'Transition vendeur non autorisée.');
    }
    updates[`sellerOrders/${uid}/${orderId}/status`] = nextStatus;
    updates[`sellerOrders/${uid}/${orderId}/updatedAt`] = now;
  } else {
    if (order.customerUid !== uid || !['payment_pending', 'confirmed'].includes(order.status) || nextStatus !== 'cancelled') {
      throw new HttpsError('permission-denied', 'Annulation non autorisée.');
    }
    updates[`orders/${orderId}/status`] = 'cancelled';
    updates[`orders/${orderId}/updatedAt`] = now;
    updates[`deliveryJobs/${orderId}/status`] = 'cancelled';
    updates[`deliveryJobs/${orderId}/updatedAt`] = now;
  }

  await db.ref().update(updates);
  return { orderId, status: nextStatus };
});

exports.submitProduct = onCall(async request => {
  const uid = requireAuth(request);
  const profile = await requireRole(uid, ['seller', 'admin']);
  const data = request.data || {};
  const tenantId = tenantFor(profile, data.tenantId);
  const name = cleanString(data.name, 240);
  const category = cleanString(data.category, 80);
  const price = centsToMoney(moneyToCents(data.price));
  if (!name || !category || price <= 0) throw new HttpsError('invalid-argument', 'Produit incomplet.');

  const productRef = db.ref('products').push();
  const productId = productRef.key;
  const now = Date.now();
  const product = {
    id: productId,
    tenantId,
    name,
    brand: cleanString(data.brand || profile.businessName || profile.name, 160),
    category,
    price,
    image: cleanString(data.image, 1000),
    delivery: cleanString(data.delivery || 'Livraison UAE avec suivi', 240),
    sellerUid: uid,
    sellerName: cleanString(profile.businessName || profile.name || data.brand, 160),
    source: 'seller',
    status: profile.role === 'admin' ? 'active' : 'pending_review',
    createdAt: now,
    updatedAt: now
  };
  await productRef.set(product);
  return { productId, status: product.status };
});

exports.approveRoleRequest = onCall(async request => {
  const adminUid = requireAuth(request);
  await requireRole(adminUid, ['admin']);
  const requestId = cleanString(request.data?.requestId, 160);
  const role = cleanString(request.data?.role, 40);
  if (!requestId || !['seller', 'courier'].includes(role)) {
    throw new HttpsError('invalid-argument', 'Demande ou rôle invalide.');
  }

  const requestSnapshot = await db.ref(`roleRequests/${requestId}`).get();
  const roleRequest = requestSnapshot.val();
  if (!roleRequest) throw new HttpsError('not-found', 'Demande introuvable.');
  if (!roleRequest.requesterUid) {
    throw new HttpsError('failed-precondition', 'Le candidat doit créer un compte avant approbation.');
  }

  const uid = roleRequest.requesterUid;
  const tenantId = cleanString(roleRequest.tenantId || DEFAULT_TENANT, 80);
  const now = Date.now();
  await db.ref().update({
    [`roleRequests/${requestId}/status`]: 'approved',
    [`roleRequests/${requestId}/assignedRole`]: role,
    [`roleRequests/${requestId}/approvedBy`]: adminUid,
    [`roleRequests/${requestId}/updatedAt`]: now,
    [`profiles/${uid}/role`]: role,
    [`profiles/${uid}/status`]: 'active',
    [`profiles/${uid}/tenantId`]: tenantId,
    [`profiles/${uid}/businessName`]: cleanString(roleRequest.businessName, 160),
    [`profiles/${uid}/updatedAt`]: now
  });
  await getAuth().setCustomUserClaims(uid, { role, tenantId });
  return { uid, role, tenantId, activation: 'existing-account-updated' };
});
