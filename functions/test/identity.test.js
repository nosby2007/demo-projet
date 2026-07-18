'use strict';

process.env.GCLOUD_PROJECT = 'sokiva-unit-test';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'sokiva-unit-test',
  databaseURL: 'https://sokiva-unit-test-default-rtdb.firebaseio.com'
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { identityConstants, normalizeAddresses } = require('../identity');

test('identity constants expose SOKIVA public brand with compatibility tenant', () => {
  assert.equal(identityConstants.BRAND_ID, 'sokiva');
  assert.equal(identityConstants.COMPAT_TENANT_ID, 'lamylenoise');
});

test('address normalization enforces one default address', () => {
  const addresses = normalizeAddresses([
    { id: 'a', label: 'Home', emirate: 'Abu Dhabi', area: 'Khalifa City', line1: 'Villa 10', isDefault: true },
    { id: 'b', label: 'Office', emirate: 'Dubai', area: 'Business Bay', line1: 'Tower 3', isDefault: true }
  ]);
  assert.equal(addresses.length, 2);
  assert.equal(addresses.filter(address => address.isDefault).length, 1);
  assert.equal(addresses[0].isDefault, true);
  assert.equal(addresses[1].isDefault, false);
});

test('address normalization selects the first address when none is default', () => {
  const addresses = normalizeAddresses([
    { id: 'a', emirate: 'Sharjah', area: 'Al Majaz', line1: 'Building 4' }
  ]);
  assert.equal(addresses[0].isDefault, true);
});

test('address normalization rejects invalid UAE phone formats', () => {
  assert.throws(() => normalizeAddresses([
    { id: 'a', emirate: 'Abu Dhabi', area: 'Al Reem', line1: 'Tower 1', phone: '+12025550123' }
  ]));
});

test('address normalization limits account addresses', () => {
  const addresses = normalizeAddresses(Array.from({ length: 8 }, (_, index) => ({
    id: `address-${index}`,
    emirate: 'Abu Dhabi',
    area: `Area ${index}`,
    line1: `Building ${index}`
  })));
  assert.equal(addresses.length, 5);
});
