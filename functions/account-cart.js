'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { cartCount, mergeLines, normalizeLines, productKey, quantity } = require('./cart-core');

if (!getApps().length) initializeApp();
const db = getDatabase();
const REGION = 'me-central1';
const DEFAULT_TENANT = 'lamylenoise';

function clean(value, max = 200) { return String(value ?? '').trim().slice(0, max); }
async function account(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour synchroniser votre panier.');
  const profile = (await db.ref(`profiles/${uid}`).get()).val();
  if (!profile || profile.status === 'disabled') throw new HttpsError('permission-denied', 'Compte non autorisé.');
  const tenantId = clean(profile.tenantId || DEFAULT_TENANT, 80) || DEFAULT_TENANT;
  const requested = clean(request.data?.tenantId || tenantId, 80) || DEFAULT_TENANT;
  if (requested !== tenantId) throw new HttpsError('permission-denied', 'Organisation non autorisée.');
  return { uid, tenantId };
}

async function resolvedCart(tenantId, uid, cart) {
  const lines = cart?.lines || {};
  const rows = await Promise.all(Object.entries(lines).map(async ([id, qty]) => {
    const product = (await db.ref(`products/${id}`).get()).val();
    if (!product || product.status !== 'active' || clean(product.tenantId || DEFAULT_TENANT, 80) !== tenantId) return null;
    const available = product.inventoryTracked === true ? Number(product.stockAvailable || 0) : 99;
    const safeQty = Math.min(quantity(qty), Math.max(0, available));
    if (!safeQty) return null;
    return { productId: id, id, name: clean(product.name, 240), brand: clean(product.brand || product.sellerName, 160), image: clean(product.image, 1000), price: Number(product.price || 0), qty: safeQty, quantity: safeQty, sellerUid: clean(product.sellerUid || 'catalog'), sellerName: clean(product.sellerName || product.brand || 'SOKIVA', 160), inventoryAdjusted: safeQty !== quantity(qty) };
  }));
  const items = rows.filter(Boolean);
  return { tenantId, uid, revision: Number(cart?.revision || 0), updatedAt: Number(cart?.updatedAt || 0), count: items.reduce((sum, item) => sum + item.qty, 0), subtotal: items.reduce((sum, item) => sum + item.price * item.qty, 0), items };
}

exports.getAccountCart = onCall({ region: REGION, maxInstances: 30 }, async request => {
  const { uid, tenantId } = await account(request);
  const guest = normalizeLines(request.data?.guestItems || []);
  const ref = db.ref(`accountCarts/${tenantId}/${uid}`);
  if (Object.keys(guest).length) await ref.transaction(current => ({ tenantId, uid, lines: mergeLines(current?.lines, guest), revision: Number(current?.revision || 0) + 1, mergedGuestAt: Date.now(), updatedAt: Date.now() }), undefined, false);
  let stored = (await ref.get()).val() || { tenantId, uid, lines: {}, revision: 0 };
  let resolved = await resolvedCart(tenantId, uid, stored);
  const validLines = Object.fromEntries(resolved.items.map(item => [item.productId, item.qty]));
  if (JSON.stringify(validLines) !== JSON.stringify(stored.lines || {})) {
    const expectedRevision = Number(stored.revision || 0);
    await ref.transaction(current => Number(current?.revision || 0) === expectedRevision ? { ...current, lines: validLines, itemCount: cartCount(validLines), revision: expectedRevision + 1, reconciledAt: Date.now(), updatedAt: Date.now() } : current, undefined, false);
    stored = (await ref.get()).val();
    resolved = await resolvedCart(tenantId, uid, stored);
  }
  return resolved;
});

exports.updateAccountCart = onCall({ region: REGION, maxInstances: 40 }, async request => {
  const { uid, tenantId } = await account(request);
  const action = clean(request.data?.action, 40);
  const id = productKey(request.data?.productId);
  const requestedQuantity = quantity(request.data?.quantity);
  if (!['set','remove','clear'].includes(action) || (action !== 'clear' && !id)) throw new HttpsError('invalid-argument', 'Action panier invalide.');
  if (action === 'set') {
    const product = (await db.ref(`products/${id}`).get()).val();
    if (!product || product.status !== 'active' || clean(product.tenantId || DEFAULT_TENANT, 80) !== tenantId) throw new HttpsError('failed-precondition', 'Produit indisponible.');
    if (!requestedQuantity) throw new HttpsError('invalid-argument', 'Quantité invalide.');
    if (product.inventoryTracked === true && requestedQuantity > Number(product.stockAvailable || 0)) throw new HttpsError('failed-precondition', 'Stock insuffisant.');
  }
  const ref = db.ref(`accountCarts/${tenantId}/${uid}`);
  await ref.transaction(current => { const cart = current || { tenantId, uid, lines: {}, revision: 0, createdAt: Date.now() }; cart.lines = cart.lines || {}; if (action === 'clear') cart.lines = {}; else if (action === 'remove') delete cart.lines[id]; else cart.lines[id] = requestedQuantity; cart.revision = Number(cart.revision || 0) + 1; cart.updatedAt = Date.now(); cart.itemCount = cartCount(cart.lines); return cart; }, undefined, false);
  return resolvedCart(tenantId, uid, (await ref.get()).val());
});

module.exports.accountCartInternals = { resolvedCart };
