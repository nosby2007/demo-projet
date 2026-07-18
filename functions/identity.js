'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');

if (!getApps().length) initializeApp();
const auth = getAuth();
const db = getDatabase();

// The database key remains temporarily compatible with the existing pilot data.
// brandId is the public product identity used by all new SOKIVA profiles.
const COMPAT_TENANT_ID = 'lamylenoise';
const BRAND_ID = 'sokiva';
const UAE_PHONE = /^\+971[0-9]{8,9}$/;
const ALLOWED_LANGUAGES = new Set(['fr', 'en', 'ar']);
const MAX_ADDRESSES = 5;

function clean(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function normalizePhone(value) {
  return clean(value, 24).replace(/[\s()-]/g, '');
}

function normalizeLanguage(value) {
  const language = clean(value, 8).toLowerCase();
  return ALLOWED_LANGUAGES.has(language) ? language : 'fr';
}

function normalizeAddress(raw, index) {
  const label = clean(raw?.label || `Adresse ${index + 1}`, 60);
  const emirate = clean(raw?.emirate, 60);
  const area = clean(raw?.area, 100);
  const line1 = clean(raw?.line1, 180);
  const instructions = clean(raw?.instructions, 240);
  const phone = normalizePhone(raw?.phone);
  if (!emirate || !area || !line1) {
    throw new HttpsError('invalid-argument', 'Chaque adresse doit contenir un émirat, une zone et une adresse.');
  }
  if (phone && !UAE_PHONE.test(phone)) {
    throw new HttpsError('invalid-argument', 'Le numéro associé à l’adresse doit être un numéro UAE valide.');
  }
  return {
    id: clean(raw?.id || `address-${Date.now()}-${index}`, 100),
    label,
    emirate,
    area,
    line1,
    instructions,
    phone,
    isDefault: raw?.isDefault === true
  };
}

function normalizeAddresses(value) {
  const rows = Array.isArray(value) ? value.slice(0, MAX_ADDRESSES) : [];
  const addresses = rows.map(normalizeAddress);
  if (addresses.length && !addresses.some(address => address.isDefault)) {
    addresses[0].isDefault = true;
  }
  let defaultSeen = false;
  return addresses.map(address => {
    if (!address.isDefault) return address;
    if (defaultSeen) return { ...address, isDefault: false };
    defaultSeen = true;
    return address;
  });
}

async function requireUser(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  const user = await auth.getUser(uid);
  return { uid, user };
}

function publicIdentity(user, profile) {
  const signedSuperAdmin = user.customClaims?.isSuperAdmin === true
    && user.customClaims?.role === 'admin'
    && profile?.role === 'admin';
  return {
    uid: user.uid,
    email: user.email || profile?.email || '',
    emailVerified: user.emailVerified === true,
    displayName: user.displayName || profile?.name || '',
    role: profile?.role || 'customer',
    status: profile?.status || 'active',
    tenantId: profile?.tenantId || COMPAT_TENANT_ID,
    brandId: profile?.brandId || BRAND_ID,
    isSuperAdmin: signedSuperAdmin,
    profile: profile || null
  };
}

exports.registerCustomerProfile = onCall({ region: 'me-central1', maxInstances: 30 }, async request => {
  const { uid, user } = await requireUser(request);
  const email = clean(request.data?.email || user.email, 200).toLowerCase();
  if (!email || email !== clean(user.email, 200).toLowerCase()) {
    throw new HttpsError('permission-denied', 'L’adresse email ne correspond pas au compte connecté.');
  }

  const firstName = clean(request.data?.firstName, 80);
  const lastName = clean(request.data?.lastName, 80);
  const name = clean(`${firstName} ${lastName}`, 160) || clean(user.displayName, 160) || email.split('@')[0];
  const phone = normalizePhone(request.data?.phone);
  if (phone && !UAE_PHONE.test(phone)) {
    throw new HttpsError('invalid-argument', 'Utilisez un numéro UAE au format +971XXXXXXXXX.');
  }

  const now = Date.now();
  const profileRef = db.ref(`profiles/${uid}`);
  let problem = null;
  const result = await profileRef.transaction(current => {
    problem = null;
    if (current && current.role && current.role !== 'customer') {
      problem = new HttpsError('failed-precondition', 'Ce compte possède déjà un rôle professionnel.');
      return;
    }
    return {
      ...(current || {}),
      uid,
      role: 'customer',
      status: current?.status || 'active',
      tenantId: current?.tenantId || COMPAT_TENANT_ID,
      brandId: BRAND_ID,
      name,
      firstName,
      lastName,
      email,
      phone,
      language: normalizeLanguage(request.data?.language),
      marketingConsent: request.data?.marketingConsent === true,
      createdAt: Number(current?.createdAt || now),
      updatedAt: now
    };
  }, undefined, false);

  if (!result.committed) throw problem || new HttpsError('aborted', 'Le profil n’a pas pu être créé.');
  await auth.setCustomUserClaims(uid, {
    ...(user.customClaims || {}),
    role: result.snapshot.val().role,
    tenantId: result.snapshot.val().tenantId,
    brandId: BRAND_ID
  });
  return publicIdentity(await auth.getUser(uid), result.snapshot.val());
});

exports.getMyIdentity = onCall({ region: 'me-central1', maxInstances: 50 }, async request => {
  const { uid, user } = await requireUser(request);
  const profile = (await db.ref(`profiles/${uid}`).get()).val();
  if (!profile) {
    return publicIdentity(user, null);
  }
  if (profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Ce compte est désactivé.');
  }
  return publicIdentity(user, profile);
});

exports.updateMyProfile = onCall({ region: 'me-central1', maxInstances: 30 }, async request => {
  const { uid, user } = await requireUser(request);
  const profileRef = db.ref(`profiles/${uid}`);
  const current = (await profileRef.get()).val();
  if (!current || current.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Profil indisponible ou désactivé.');
  }

  const firstName = clean(request.data?.firstName ?? current.firstName, 80);
  const lastName = clean(request.data?.lastName ?? current.lastName, 80);
  const phone = normalizePhone(request.data?.phone ?? current.phone);
  if (phone && !UAE_PHONE.test(phone)) {
    throw new HttpsError('invalid-argument', 'Utilisez un numéro UAE au format +971XXXXXXXXX.');
  }
  const addresses = request.data?.addresses === undefined
    ? (Array.isArray(current.addresses) ? current.addresses : [])
    : normalizeAddresses(request.data.addresses);
  const name = clean(`${firstName} ${lastName}`, 160) || clean(user.displayName, 160) || clean(current.name, 160);

  const updates = {
    firstName,
    lastName,
    name,
    phone,
    language: normalizeLanguage(request.data?.language ?? current.language),
    addresses,
    brandId: BRAND_ID,
    updatedAt: Date.now()
  };
  await profileRef.update(updates);
  if (name && name !== user.displayName) await auth.updateUser(uid, { displayName: name });
  return publicIdentity(await auth.getUser(uid), { ...current, ...updates });
});

exports.identityConstants = Object.freeze({ COMPAT_TENANT_ID, BRAND_ID });
exports.normalizeAddresses = normalizeAddresses;
