'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cartCount, mergeLines, normalizeLines, productKey, quantity } = require('../cart-core');

test('guest cart normalization merges duplicate product lines', () => { assert.deepEqual(normalizeLines([{ id: 1, qty: 2 }, { productId: 'catalog-1', quantity: 3 }]), { 'catalog-1': 5 }); });
test('cart quantities are bounded and invalid values are removed', () => { assert.equal(quantity(150), 99); assert.equal(quantity(-1), 0); assert.deepEqual(normalizeLines([{ id: 'x', qty: 0 }, { id: 'y', qty: 2 }]), { y: 2 }); });
test('account and guest carts merge without exceeding per-line bounds', () => { assert.deepEqual(mergeLines({ p: 90 }, { p: 20, q: 1 }), { p: 99, q: 1 }); });
test('cart count and legacy numeric product IDs are deterministic', () => { assert.equal(cartCount({ a: 2, b: 3 }), 5); assert.equal(productKey('12'), 'catalog-12'); });
