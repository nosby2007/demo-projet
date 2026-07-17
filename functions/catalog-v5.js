'use strict';

const { getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { toCents, fromCents } = require('./commerce');

if (!getApps().length) initializeApp();
const db = getDatabase();
const DEFAULT_TENANT = 'lamylenoise';

function clean(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function ensure(root, key) {
  if (!root[key] || typeof root[key] !== 'object') root[key] = {};
  return root[key];
}

async function requireRole(request, roles) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour continuer.');
  const snapshot = await db.ref(`profiles/${uid}`).get();
  const profile = snapshot.val();
  if (!profile || !roles.includes(profile.role) || profile.status === 'disabled') {
    throw new HttpsError('permission-denied', 'Rôle ou compte non autorisé.');
  }
  return { uid, profile };
}

function tenantFor(profile, requestedTenant) {
  const profileTenant = clean(profile?.tenantId || DEFAULT_TENANT, 80);
  const tenantId = clean(requestedTenant || profileTenant, 80) || DEFAULT_TENANT;
  if (tenantId !== profileTenant) throw new HttpsError('permission-denied', 'Organisation non autorisée.');
  return tenantId;
}

function publicProduct(product, productId) {
  return {
    id: productId,
    tenantId: product.tenantId,
    name: clean(product.name, 240),
    sku: clean(product.sku || productId, 100),
    brand: clean(product.brand || product.sellerName, 160),
    category: clean(product.category, 80),
    price: Number(product.price || 0),
    image: clean(product.image, 1000),
    delivery: clean(product.delivery, 240),
    sellerName: clean(product.sellerName || product.brand, 160),
    source: clean(product.source || 'seller', 40),
    inventoryTracked: product.inventoryTracked === true,
    stockAvailable: product.inventoryTracked === true ? Number(product.stockAvailable || 0) : null,
    status: 'active',
    updatedAt: Number(product.updatedAt || Date.now())
  };
}

exports.submitProduct = onCall(async request => {
  const { uid, profile } = await requireRole(request, ['seller', 'admin']);
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
  const stockOnHand = inventoryTracked
    ? Number.parseInt(data.stockOnHand ?? data.stockAvailable, 10)
    : 0;
  if (!name || !category || price <= 0) throw new HttpsError('invalid-argument', 'Produit incomplet.');
  if (inventoryTracked && (!Number.isInteger(stockOnHand) || stockOnHand < 0 || stockOnHand > 100000)) {
    throw new HttpsError('invalid-argument', 'Stock physique initial invalide.');
  }

  const productId = db.ref('products').push().key;
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
    stockAvailable: stockOnHand,
    stockReserved: 0,
    stockSold: 0,
    status: catalogProduct ? 'active' : 'pending_review',
    createdAt: now,
    updatedAt: now
  };

  const updates = { [`products/${productId}`]: product };
  if (product.status === 'active') {
    updates[`publicCatalog/${tenantId}/${productId}`] = publicProduct(product, productId);
  }
  await db.ref().update(updates);
  return { productId, status: product.status };
});

exports.reviewProduct = onCall(async request => {
  const { uid, profile } = await requireRole(request, ['admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const productId = clean(request.data?.productId, 160);
  const decision = clean(request.data?.decision, 20);
  if (!productId || !['approve', 'reject'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Produit ou décision invalide.');
  }

  let problem = null;
  let resultingStatus = null;
  const result = await db.ref().transaction(current => {
    problem = null;
    resultingStatus = null;
    const root = current || {};
    const product = root.products?.[productId];
    if (!product) {
      problem = new HttpsError('not-found', 'Produit introuvable.');
      return;
    }
    if (product.tenantId !== tenantId) {
      problem = new HttpsError('permission-denied', 'Produit rattaché à une autre organisation.');
      return;
    }
    if (decision === 'approve' && product.inventoryTracked === true && Number(product.stockAvailable || 0) < 1) {
      problem = new HttpsError('failed-precondition', 'Ajoutez du stock avant activation.');
      return;
    }

    resultingStatus = decision === 'approve' ? 'active' : 'rejected';
    product.status = resultingStatus;
    product.reviewedBy = uid;
    product.reviewedAt = Date.now();
    product.updatedAt = Date.now();

    const publicCatalog = ensure(root, 'publicCatalog');
    const tenantCatalog = ensure(publicCatalog, tenantId);
    if (resultingStatus === 'active') {
      tenantCatalog[productId] = publicProduct(product, productId);
    } else {
      delete tenantCatalog[productId];
    }
    return root;
  }, undefined, false);

  if (!result.committed) throw problem || new HttpsError('aborted', 'Le produit n’a pas été révisé.');
  return { productId, status: resultingStatus };
});

exports.updateInventory = onCall(async request => {
  const { uid, profile } = await requireRole(request, ['seller', 'admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const productId = clean(request.data?.productId, 160);
  const stockOnHand = Number.parseInt(request.data?.stockOnHand ?? request.data?.stockAvailable, 10);
  if (!productId || !Number.isInteger(stockOnHand) || stockOnHand < 0 || stockOnHand > 100000) {
    throw new HttpsError('invalid-argument', 'Produit ou stock physique invalide.');
  }

  let problem = null;
  const productRef = db.ref(`products/${productId}`);
  const result = await productRef.transaction(product => {
    problem = null;
    if (!product) {
      problem = new HttpsError('not-found', 'Produit introuvable.');
      return;
    }
    if (product.tenantId !== tenantId || (profile.role !== 'admin' && product.sellerUid !== uid)) {
      problem = new HttpsError('permission-denied', 'Produit non autorisé.');
      return;
    }
    if (product.inventoryTracked !== true) {
      problem = new HttpsError('failed-precondition', 'Le mode de stock est immuable. Un service ne peut pas devenir un produit stocké.');
      return;
    }

    const reserved = Math.max(0, Number(product.stockReserved || 0));
    if (stockOnHand < reserved) {
      problem = new HttpsError(
        'failed-precondition',
        `Le stock physique ne peut pas être inférieur aux ${reserved} unité(s) déjà réservée(s).`
      );
      return;
    }
    product.stockAvailable = stockOnHand - reserved;
    product.updatedAt = Date.now();
    return product;
  }, undefined, false);

  if (!result.committed) throw problem || new HttpsError('aborted', 'Le stock n’a pas été modifié.');
  const product = result.snapshot.val();
  if (product.status === 'active') {
    await db.ref(`publicCatalog/${tenantId}/${productId}`).set(publicProduct(product, productId));
  }
  return {
    productId,
    stockOnHand,
    stockReserved: Number(product.stockReserved || 0),
    stockAvailable: Number(product.stockAvailable || 0),
    inventoryTracked: true
  };
});

exports.seedCatalogProducts = onCall(async request => {
  const { profile } = await requireRole(request, ['admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const products = Array.isArray(request.data?.products) ? request.data.products.slice(0, 1000) : [];
  if (!products.length) throw new HttpsError('invalid-argument', 'Catalogue vide.');

  const now = Date.now();
  const updates = {};
  for (const item of products) {
    const rawId = clean(item.id, 100);
    if (!rawId) continue;
    const productId = rawId.startsWith('catalog-') ? rawId : `catalog-${rawId}`;
    const product = {
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
    updates[`products/${productId}`] = product;
    updates[`publicCatalog/${tenantId}/${productId}`] = publicProduct(product, productId);
  }
  await db.ref().update(updates);
  return { imported: Object.keys(updates).length / 2 };
});

exports.rebuildPublicCatalog = onCall(async request => {
  const { profile } = await requireRole(request, ['admin']);
  const tenantId = tenantFor(profile, request.data?.tenantId);
  const snapshot = await db.ref('products').orderByChild('tenantId').equalTo(tenantId).get();
  const products = snapshot.val() || {};
  const catalog = {};
  for (const [productId, product] of Object.entries(products)) {
    if (product.status === 'active') catalog[productId] = publicProduct(product, productId);
  }
  await db.ref(`publicCatalog/${tenantId}`).set(catalog);
  return { tenantId, published: Object.keys(catalog).length };
});
