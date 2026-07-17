'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { onValueWritten } = require('firebase-functions/v2/database');

if (!getApps().length) initializeApp();
const db = getDatabase();

const DEFAULT_TENANT = 'lamylenoise';
const DATABASE_REGION = 'us-central1';
const LOCATION_MIN_INTERVAL_MS = 4000;
const LOCATION_MAX_AGE_MS = 2 * 60 * 1000;
const MAX_ACCURACY_METERS = 250;
const TERMINAL_STATUSES = new Set(['delivered', 'cancelled', 'refunded']);
const STATUS_PROGRESS = Object.freeze({
  confirmed: 20,
  preparing: 40,
  ready_for_pickup: 60,
  in_transit: 80,
  delivered: 100,
  cancelled: 100,
  refunded: 100
});

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, precision = 5) {
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function validateUaePoint(raw, label = 'Position') {
  const latitude = finite(raw?.latitude);
  const longitude = finite(raw?.longitude);
  const accuracy = finite(raw?.accuracyMeters ?? raw?.accuracy);
  if (latitude === null || longitude === null) {
    throw new HttpsError('invalid-argument', `${label} invalide.`);
  }
  if (latitude < 22 || latitude > 27 || longitude < 51 || longitude > 57.5) {
    throw new HttpsError('out-of-range', `${label} hors de la zone UAE autorisée.`);
  }
  if (accuracy !== null && (accuracy < 0 || accuracy > MAX_ACCURACY_METERS)) {
    throw new HttpsError('failed-precondition', `${label} trop imprécise. Réessayez à l’extérieur ou activez le GPS précis.`);
  }
  return {
    latitude: round(latitude),
    longitude: round(longitude),
    accuracyMeters: accuracy === null ? null : Math.round(accuracy)
  };
}

function haversineMeters(a, b) {
  if (!a || !b) return null;
  const toRadians = degrees => degrees * Math.PI / 180;
  const earthRadius = 6371000;
  const dLatitude = toRadians(b.latitude - a.latitude);
  const dLongitude = toRadians(b.longitude - a.longitude);
  const latitude1 = toRadians(a.latitude);
  const latitude2 = toRadians(b.latitude);
  const value = Math.sin(dLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(dLongitude / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(value));
}

function routeEstimate(location, destination) {
  const directMeters = haversineMeters(location, destination);
  if (directMeters === null) return { distanceRemainingKm: null, etaMinutes: null };
  const roadAdjustedKm = directMeters * 1.25 / 1000;
  const etaMinutes = Math.max(2, Math.min(240, Math.ceil((roadAdjustedKm / 35) * 60)));
  return {
    distanceRemainingKm: Math.round(roadAdjustedKm * 10) / 10,
    etaMinutes
  };
}

async function requireProfile(request, roles) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  const snapshot = await db.ref(`profiles/${uid}`).get();
  const profile = snapshot.val();
  if (!profile || !roles.includes(profile.role) || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Compte non autorisé pour cette opération.');
  }
  return { uid, profile };
}

function tenantFor(profile, requestedTenant) {
  const profileTenant = clean(profile?.tenantId || DEFAULT_TENANT, 80);
  const tenantId = clean(requestedTenant || profileTenant, 80) || DEFAULT_TENANT;
  if (tenantId !== profileTenant) throw new HttpsError('permission-denied', 'Organisation non autorisée.');
  return tenantId;
}

function publicDestination(order) {
  if (!order?.deliveryLocation) return null;
  try {
    const point = validateUaePoint(order.deliveryLocation, 'Point de livraison');
    return {
      latitude: point.latitude,
      longitude: point.longitude,
      updatedAt: Number(order.deliveryLocation.updatedAt || order.updatedAt || Date.now())
    };
  } catch {
    return null;
  }
}

exports.syncOrderTracking = onValueWritten({
  ref: '/orders/{orderId}',
  region: DATABASE_REGION
}, async event => {
  const before = event.data.before.exists() ? event.data.before.val() : null;
  const after = event.data.after.exists() ? event.data.after.val() : null;
  const orderId = event.params.orderId;
  const trackingRef = db.ref(`orderTracking/${orderId}`);

  if (!after) {
    await trackingRef.remove();
    return;
  }

  const status = clean(after.status || 'confirmed', 60);
  const now = Number(after.updatedAt || Date.now());
  const destination = publicDestination(after);
  await trackingRef.transaction(current => {
    const tracking = current || {};
    tracking.orderId = orderId;
    tracking.tenantId = clean(after.tenantId || DEFAULT_TENANT, 80);
    tracking.status = status;
    tracking.progress = STATUS_PROGRESS[status] ?? 10;
    tracking.live = status === 'in_transit';
    tracking.createdAt = Number(tracking.createdAt || after.createdAt || now);
    tracking.updatedAt = now;
    tracking.statusHistory = tracking.statusHistory || {};

    if (!before || before.status !== status || !tracking.statusHistory[status]) {
      tracking.statusHistory[status] = now;
    }
    if (!tracking.statusHistory.received) {
      tracking.statusHistory.received = Number(after.createdAt || now);
    }
    if (destination) tracking.destination = destination;

    if (TERMINAL_STATUSES.has(status)) {
      delete tracking.courierLocation;
      delete tracking.distanceRemainingKm;
      delete tracking.etaMinutes;
      tracking.live = false;
      tracking.completedAt = now;
    }
    return tracking;
  }, undefined, false);
});

exports.setDeliveryDestination = onCall({ region: 'me-central1', maxInstances: 20 }, async request => {
  const { uid, profile } = await requireProfile(request, ['customer', 'admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const orderId = clean(request.data?.orderId, 160);
  if (!orderId) throw new HttpsError('invalid-argument', 'Commande manquante.');

  const point = validateUaePoint(request.data?.location, 'Point de livraison');
  const orderRef = db.ref(`orders/${orderId}`);
  const orderSnapshot = await orderRef.get();
  const order = orderSnapshot.val();
  if (!order) throw new HttpsError('not-found', 'Commande introuvable.');
  if (clean(order.tenantId || DEFAULT_TENANT, 80) !== tenantId) {
    throw new HttpsError('permission-denied', 'Commande rattachée à une autre organisation.');
  }
  if (profile.role !== 'admin' && order.customerUid !== uid) {
    throw new HttpsError('permission-denied', 'Cette commande ne vous appartient pas.');
  }
  if (TERMINAL_STATUSES.has(order.status)) {
    throw new HttpsError('failed-precondition', 'Le point de livraison ne peut plus être modifié.');
  }

  const now = Date.now();
  const location = {
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyMeters: point.accuracyMeters,
    source: clean(request.data?.source || 'customer_map', 40),
    setByUid: uid,
    capturedAt: Number(request.data?.capturedAt || now),
    updatedAt: now
  };
  await orderRef.update({ deliveryLocation: location, updatedAt: now });
  await db.ref(`orderTracking/${orderId}/destination`).set({
    latitude: location.latitude,
    longitude: location.longitude,
    updatedAt: now
  });
  return { orderId, destination: { latitude: location.latitude, longitude: location.longitude } };
});

exports.updateCourierLocation = onCall({ region: 'me-central1', maxInstances: 50 }, async request => {
  const { uid, profile } = await requireProfile(request, ['courier']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const orderId = clean(request.data?.orderId, 160);
  if (!orderId) throw new HttpsError('invalid-argument', 'Commande manquante.');

  const capturedAt = Number(request.data?.capturedAt || Date.now());
  const now = Date.now();
  if (!Number.isFinite(capturedAt) || capturedAt < now - LOCATION_MAX_AGE_MS || capturedAt > now + 30000) {
    throw new HttpsError('failed-precondition', 'Position GPS trop ancienne ou horodatage invalide.');
  }
  const point = validateUaePoint(request.data?.location, 'Position du livreur');
  const [orderSnapshot, jobSnapshot, trackingSnapshot] = await Promise.all([
    db.ref(`orders/${orderId}`).get(),
    db.ref(`deliveryJobs/${orderId}`).get(),
    db.ref(`orderTracking/${orderId}`).get()
  ]);
  const order = orderSnapshot.val();
  const job = jobSnapshot.val();
  const tracking = trackingSnapshot.val() || {};
  if (!order || !job) throw new HttpsError('not-found', 'Course introuvable.');
  if (order.tenantId !== tenantId || job.tenantId !== tenantId || order.courierUid !== uid || job.courierUid !== uid) {
    throw new HttpsError('permission-denied', 'Cette course ne vous est pas attribuée.');
  }
  if (order.status !== 'in_transit' || job.status !== 'in_transit') {
    throw new HttpsError('failed-precondition', 'Le partage GPS est autorisé uniquement pendant la livraison.');
  }

  const previous = tracking.courierLocation;
  if (previous && now - Number(previous.publishedAt || 0) < LOCATION_MIN_INTERVAL_MS) {
    return { orderId, accepted: false, reason: 'throttled' };
  }
  if (previous?.capturedAt) {
    const elapsedSeconds = Math.max(1, (capturedAt - Number(previous.capturedAt)) / 1000);
    const movedMeters = haversineMeters(previous, point);
    const allowedMeters = 500 + elapsedSeconds * 60;
    if (movedMeters !== null && movedMeters > allowedMeters) {
      throw new HttpsError('out-of-range', 'Déplacement GPS impossible détecté. Attendez une nouvelle position précise.');
    }
  }

  const destination = publicDestination(order) || tracking.destination || null;
  const estimate = routeEstimate(point, destination);
  const heading = finite(request.data?.heading);
  const speedMetersPerSecond = finite(request.data?.speedMetersPerSecond);
  const courierLocation = {
    latitude: point.latitude,
    longitude: point.longitude,
    accuracyMeters: point.accuracyMeters,
    heading: heading === null ? null : Math.max(0, Math.min(360, Math.round(heading))),
    speedKph: speedMetersPerSecond === null ? null : Math.max(0, Math.min(180, Math.round(speedMetersPerSecond * 36) / 10)),
    capturedAt,
    publishedAt: now
  };

  await db.ref(`orderTracking/${orderId}`).update({
    orderId,
    tenantId,
    status: 'in_transit',
    progress: 80,
    live: true,
    destination,
    courierLocation,
    distanceRemainingKm: estimate.distanceRemainingKm,
    etaMinutes: estimate.etaMinutes,
    updatedAt: now
  });

  return {
    orderId,
    accepted: true,
    distanceRemainingKm: estimate.distanceRemainingKm,
    etaMinutes: estimate.etaMinutes,
    publishedAt: now
  };
});

exports.haversineMeters = haversineMeters;
exports.validateUaePoint = validateUaePoint;
exports.routeEstimate = routeEstimate;
