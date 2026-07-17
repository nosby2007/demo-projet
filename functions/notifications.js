'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');

if (!getApps().length) initializeApp();
const db = getDatabase();

const DEFAULT_TENANT = 'lamylenoise';
const DATABASE_REGION = 'us-central1';
const MAX_ROLE_RECIPIENTS = 200;
const MAX_MARK_ALL = 200;
const NEARBY_DISTANCE_KM = 1;

function clean(value, max = 240) {
  return String(value || '').trim().slice(0, max);
}

function safeKey(value, max = 220) {
  return clean(value, max).replace(/[.#$\[\]/]/g, '_');
}

function shortOrderId(orderId) {
  const value = clean(orderId, 160);
  return value.length > 10 ? value.slice(-8).toUpperCase() : value.toUpperCase();
}

function notificationId(orderId, eventKey) {
  return safeKey(`${clean(orderId, 160)}_${clean(eventKey, 80)}`);
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function shouldNotifyNearby(before, after) {
  if (!after || after.status !== 'in_transit' || after.live !== true) return false;
  const currentDistance = finiteOrNull(after.distanceRemainingKm);
  if (currentDistance === null || currentDistance > NEARBY_DISTANCE_KM) return false;
  const previousDistance = finiteOrNull(before?.distanceRemainingKm);
  return previousDistance === null || previousDistance > NEARBY_DISTANCE_KM;
}

function customerStatusSpec(status, orderId) {
  const reference = shortOrderId(orderId);
  const specs = {
    confirmed: {
      type: 'order_confirmed',
      title: 'Commande confirmée',
      body: `La commande ${reference} a bien été reçue.`,
      priority: 'normal'
    },
    preparing: {
      type: 'order_preparing',
      title: 'Préparation en cours',
      body: `Les vendeurs préparent la commande ${reference}.`,
      priority: 'normal'
    },
    ready_for_pickup: {
      type: 'order_ready',
      title: 'Commande prête',
      body: `La commande ${reference} est prête pour le livreur.`,
      priority: 'normal'
    },
    in_transit: {
      type: 'courier_on_way',
      title: 'Le livreur est en route',
      body: `Suivez la commande ${reference} sur la carte en temps réel.`,
      priority: 'high'
    },
    delivered: {
      type: 'order_delivered',
      title: 'Commande livrée',
      body: `La commande ${reference} a été remise avec succès.`,
      priority: 'high'
    },
    cancelled: {
      type: 'order_cancelled',
      title: 'Commande annulée',
      body: `La commande ${reference} a été annulée.`,
      priority: 'high'
    },
    refunded: {
      type: 'order_refunded',
      title: 'Commande remboursée',
      body: `Le remboursement de la commande ${reference} a été enregistré.`,
      priority: 'high'
    }
  };
  return specs[status] || null;
}

function buildNotification(order, eventKey, role, spec, createdAt = Date.now()) {
  const orderId = clean(order?.id, 160);
  const tenantId = clean(order?.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;
  const roleHome = role === 'seller'
    ? 'seller.html'
    : role === 'courier'
      ? 'courier.html'
      : role === 'admin'
        ? 'admin.html'
        : 'customer.html';
  return {
    id: notificationId(orderId, eventKey),
    tenantId,
    orderId,
    eventKey: clean(eventKey, 80),
    role: clean(role, 40),
    type: clean(spec.type, 80),
    title: clean(spec.title, 160),
    body: clean(spec.body, 320),
    deepLink: `${roleHome}?order=${encodeURIComponent(orderId)}`,
    priority: spec.priority === 'high' ? 'high' : 'normal',
    createdAt: Number(createdAt || Date.now()),
    readAt: null
  };
}

async function writeNotification(uid, order, eventKey, role, spec, createdAt) {
  const recipientUid = clean(uid, 160);
  if (!recipientUid || recipientUid === 'catalog' || !order?.id || !spec) return null;
  const payload = buildNotification(order, eventKey, role, spec, createdAt);
  const ref = db.ref(`userNotifications/${recipientUid}/${payload.id}`);
  const result = await ref.transaction(current => current || payload, undefined, false);
  return result.snapshot.val() || null;
}

async function notifyMany(uids, order, eventKey, role, spec, createdAt) {
  const unique = [...new Set((uids || []).map(uid => clean(uid, 160)).filter(Boolean))];
  await Promise.allSettled(unique.map(uid => writeNotification(uid, order, eventKey, role, spec, createdAt)));
}

function sellerUids(order) {
  return Object.keys(order?.sellerUids || {}).filter(uid => uid && uid !== 'catalog');
}

async function activeRoleUids(tenantId, role) {
  const snapshot = await db.ref('profiles')
    .orderByChild('role')
    .equalTo(role)
    .limitToFirst(MAX_ROLE_RECIPIENTS)
    .get();
  return Object.entries(snapshot.val() || {})
    .filter(([, profile]) => clean(profile?.tenantId || DEFAULT_TENANT, 80) === tenantId)
    .filter(([, profile]) => profile?.status !== 'disabled')
    .map(([uid]) => uid);
}

async function notifyCustomerStatus(order, status, createdAt) {
  const spec = customerStatusSpec(status, order.id);
  if (!spec || !order.customerUid) return;
  await writeNotification(order.customerUid, order, `status_${status}`, 'customer', spec, createdAt);
}

async function notifyOrderCreated(order, createdAt) {
  const reference = shortOrderId(order.id);
  const tasks = [
    writeNotification(order.customerUid, order, 'order_received', 'customer', {
      type: 'order_received',
      title: 'Commande reçue',
      body: `La commande ${reference} est enregistrée et sécurisée.`,
      priority: 'normal'
    }, createdAt),
    notifyMany(sellerUids(order), order, 'new_order', 'seller', {
      type: 'seller_new_order',
      title: 'Nouvelle commande',
      body: `Une nouvelle commande ${reference} attend votre préparation.`,
      priority: 'high'
    }, createdAt)
  ];
  await Promise.allSettled(tasks);
}

async function notifyStatusActors(order, status, createdAt) {
  const reference = shortOrderId(order.id);
  const tasks = [notifyCustomerStatus(order, status, createdAt)];

  if (status === 'ready_for_pickup') {
    const couriers = await activeRoleUids(order.tenantId || DEFAULT_TENANT, 'courier');
    tasks.push(notifyMany(couriers, order, 'delivery_available', 'courier', {
      type: 'delivery_available',
      title: 'Nouvelle course disponible',
      body: `La course ${reference} est prête au retrait.`,
      priority: 'high'
    }, createdAt));
  }

  if (status === 'in_transit' && order.courierUid) {
    tasks.push(writeNotification(order.courierUid, order, 'delivery_started', 'courier', {
      type: 'delivery_started',
      title: 'Course démarrée',
      body: `Le suivi GPS de la course ${reference} peut maintenant être activé.`,
      priority: 'high'
    }, createdAt));
  }

  if (status === 'delivered') {
    tasks.push(notifyMany(sellerUids(order), order, 'seller_delivered', 'seller', {
      type: 'seller_order_delivered',
      title: 'Vente livrée',
      body: `La commande ${reference} est livrée; le revenu devient éligible.`,
      priority: 'high'
    }, createdAt));
    if (order.courierUid) {
      tasks.push(writeNotification(order.courierUid, order, 'courier_earning', 'courier', {
        type: 'courier_earning_available',
        title: 'Livraison terminée',
        body: `Le revenu de la course ${reference} est maintenant éligible.`,
        priority: 'high'
      }, createdAt));
    }
  }

  if (status === 'cancelled' || status === 'refunded') {
    tasks.push(notifyMany(sellerUids(order), order, `seller_${status}`, 'seller', {
      type: `seller_order_${status}`,
      title: status === 'cancelled' ? 'Commande annulée' : 'Commande remboursée',
      body: `La commande ${reference} ne doit plus être préparée.`,
      priority: 'high'
    }, createdAt));
    if (order.courierUid) {
      tasks.push(writeNotification(order.courierUid, order, `courier_${status}`, 'courier', {
        type: `courier_order_${status}`,
        title: 'Course interrompue',
        body: `La course ${reference} n’est plus active.`,
        priority: 'high'
      }, createdAt));
    }
    const admins = await activeRoleUids(order.tenantId || DEFAULT_TENANT, 'admin');
    tasks.push(notifyMany(admins, order, `admin_${status}`, 'admin', {
      type: `admin_order_${status}`,
      title: 'Commande à vérifier',
      body: `La commande ${reference} est ${status === 'cancelled' ? 'annulée' : 'remboursée'}.`,
      priority: 'high'
    }, createdAt));
  }

  await Promise.allSettled(tasks);
}

async function requireActiveUser(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  const profile = (await db.ref(`profiles/${uid}`).get()).val();
  if (!profile || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Compte non autorisé.');
  }
  return { uid, profile };
}

exports.notifyOrderChanges = onValueWritten({
  ref: '/orders/{orderId}',
  region: DATABASE_REGION
}, async event => {
  const before = event.data.before.exists() ? event.data.before.val() : null;
  const after = event.data.after.exists() ? event.data.after.val() : null;
  if (!after) return;

  const order = { ...after, id: after.id || event.params.orderId };
  const createdAt = Number(order.updatedAt || order.createdAt || Date.now());
  if (!before) {
    await notifyOrderCreated(order, createdAt);
    if (order.status && order.status !== 'confirmed') {
      await notifyStatusActors(order, order.status, createdAt);
    }
    return;
  }

  if (before.status !== order.status) {
    await notifyStatusActors(order, order.status, createdAt);
  }
});

exports.notifyCourierNearby = onValueWritten({
  ref: '/orderTracking/{orderId}',
  region: DATABASE_REGION
}, async event => {
  const before = event.data.before.exists() ? event.data.before.val() : null;
  const after = event.data.after.exists() ? event.data.after.val() : null;
  if (!shouldNotifyNearby(before, after)) return;

  const orderSnapshot = await db.ref(`orders/${event.params.orderId}`).get();
  const order = orderSnapshot.val();
  if (!order || order.status !== 'in_transit' || !order.customerUid) return;
  const reference = shortOrderId(order.id || event.params.orderId);
  await writeNotification(order.customerUid, { ...order, id: order.id || event.params.orderId }, 'courier_nearby', 'customer', {
    type: 'courier_nearby',
    title: 'Votre livreur est proche',
    body: `Le livreur de la commande ${reference} se trouve à moins de 1 km.`,
    priority: 'high'
  }, Number(after.updatedAt || Date.now()));
});

exports.markNotificationRead = onCall({ region: 'me-central1', maxInstances: 30 }, async request => {
  const { uid } = await requireActiveUser(request);
  const id = clean(request.data?.notificationId, 220);
  if (!id || safeKey(id) !== id) {
    throw new HttpsError('invalid-argument', 'Notification invalide.');
  }

  let problem = null;
  const now = Date.now();
  const result = await db.ref(`userNotifications/${uid}/${id}`).transaction(current => {
    problem = null;
    if (!current) {
      problem = new HttpsError('not-found', 'Notification introuvable.');
      return;
    }
    if (current.readAt) return current;
    return { ...current, readAt: now };
  }, undefined, false);
  if (!result.committed) throw problem || new HttpsError('aborted', 'Notification non modifiée.');
  return { notificationId: id, readAt: Number(result.snapshot.val()?.readAt || now) };
});

exports.markAllNotificationsRead = onCall({ region: 'me-central1', maxInstances: 20 }, async request => {
  const { uid } = await requireActiveUser(request);
  const ref = db.ref(`userNotifications/${uid}`);
  const snapshot = await ref.orderByChild('createdAt').limitToLast(MAX_MARK_ALL).get();
  const now = Date.now();
  const updates = {};
  for (const [id, notification] of Object.entries(snapshot.val() || {})) {
    if (!notification?.readAt) updates[`${id}/readAt`] = now;
  }
  if (Object.keys(updates).length) await ref.update(updates);
  return { marked: Object.keys(updates).length, readAt: now };
});

exports.notificationId = notificationId;
exports.buildNotification = buildNotification;
exports.customerStatusSpec = customerStatusSpec;
exports.shouldNotifyNearby = shouldNotifyNearby;
exports.sellerUids = sellerUids;
