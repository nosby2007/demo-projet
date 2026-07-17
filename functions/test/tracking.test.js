'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  haversineMeters,
  validateUaePoint,
  routeEstimate
} = require('../tracking');

test('haversine distance is zero for the same point', () => {
  const point = { latitude: 24.4539, longitude: 54.3773 };
  assert.equal(haversineMeters(point, point), 0);
});

test('route estimate returns a bounded approximate ETA', () => {
  const result = routeEstimate(
    { latitude: 24.4539, longitude: 54.3773 },
    { latitude: 24.5000, longitude: 54.4000 }
  );
  assert.ok(result.distanceRemainingKm > 0);
  assert.ok(result.etaMinutes >= 2 && result.etaMinutes <= 240);
});

test('UAE point validation rejects foreign coordinates and poor accuracy', () => {
  assert.throws(() => validateUaePoint({ latitude: 40.7128, longitude: -74.0060, accuracyMeters: 10 }));
  assert.throws(() => validateUaePoint({ latitude: 24.4539, longitude: 54.3773, accuracyMeters: 500 }));
});

test('UAE point validation rounds accepted coordinates', () => {
  const point = validateUaePoint({
    latitude: 24.453912345,
    longitude: 54.377312345,
    accuracyMeters: 12.4
  });
  assert.deepEqual(point, {
    latitude: 24.45391,
    longitude: 54.37731,
    accuracyMeters: 12
  });
});
