'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { test, before, after } = require('node:test');
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require('@firebase/rules-unit-testing');
const { ref, uploadBytes, getBytes } = require('firebase/storage');

let testEnv;

const SMALL_IMAGE = new Uint8Array([1, 2, 3, 4]);
const OVERSIZED_IMAGE = new Uint8Array(6 * 1024 * 1024);

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'sokiva-rules-test',
    storage: {
      rules: readFileSync(path.join(__dirname, '../../storage.rules'), 'utf8')
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

test('a signed-in user can upload an image under their own uid', async () => {
  const storage = testEnv.authenticatedContext('seller-1').storage();
  await assertSucceeds(uploadBytes(ref(storage, 'productImages/seller-1/photo.jpg'), SMALL_IMAGE, { contentType: 'image/jpeg' }));
});

test('a signed-in user cannot upload under a different uid', async () => {
  const storage = testEnv.authenticatedContext('seller-1').storage();
  await assertFails(uploadBytes(ref(storage, 'productImages/seller-2/photo.jpg'), SMALL_IMAGE, { contentType: 'image/jpeg' }));
});

test('an unauthenticated visitor cannot upload', async () => {
  const storage = testEnv.unauthenticatedContext().storage();
  await assertFails(uploadBytes(ref(storage, 'productImages/seller-1/photo.jpg'), SMALL_IMAGE, { contentType: 'image/jpeg' }));
});

test('non-image content types are rejected', async () => {
  const storage = testEnv.authenticatedContext('seller-1').storage();
  await assertFails(uploadBytes(ref(storage, 'productImages/seller-1/payload.txt'), SMALL_IMAGE, { contentType: 'text/plain' }));
});

test('oversized images are rejected', async () => {
  const storage = testEnv.authenticatedContext('seller-1').storage();
  await assertFails(uploadBytes(ref(storage, 'productImages/seller-1/huge.jpg'), OVERSIZED_IMAGE, { contentType: 'image/jpeg' }));
});

test('product images are publicly readable, including by anonymous visitors', async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await uploadBytes(ref(context.storage(), 'productImages/seller-1/photo.jpg'), SMALL_IMAGE, { contentType: 'image/jpeg' });
  });
  const storage = testEnv.unauthenticatedContext().storage();
  await assertSucceeds(getBytes(ref(storage, 'productImages/seller-1/photo.jpg')));
});

test('paths outside productImages are denied entirely', async () => {
  const storage = testEnv.authenticatedContext('seller-1').storage();
  await assertFails(uploadBytes(ref(storage, 'other/seller-1/photo.jpg'), SMALL_IMAGE, { contentType: 'image/jpeg' }));
});
