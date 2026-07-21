'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOrderConfirmationEmail, SENDER_EMAIL } = require('../email-notifications');

function sampleOrder(overrides = {}) {
  return {
    id: 'order-1',
    email: 'client@example.com',
    customerName: 'Aminata Diop',
    emirate: 'Dubai',
    address: 'Villa 12, Al Barsha',
    subtotal: 100,
    shipping: 15,
    total: 115,
    items: [
      { name: 'Bissap 250g', quantity: 2, lineTotal: 36 },
      { name: 'Café Robusta 500g', quantity: 1, lineTotal: 35 }
    ],
    ...overrides
  };
}

test('builds a confirmation email addressed to the customer with the configured sender', () => {
  const message = buildOrderConfirmationEmail(sampleOrder(), '482913');
  assert.equal(message.to, 'client@example.com');
  assert.equal(message.from.email, SENDER_EMAIL);
  assert.match(message.subject, /order-1/);
});

test('email body lists items, totals and the delivery code', () => {
  const message = buildOrderConfirmationEmail(sampleOrder(), '482913');
  assert.match(message.text, /Bissap 250g/);
  assert.match(message.text, /115/);
  assert.match(message.text, /482913/);
  assert.match(message.html, /Bissap 250g/);
  assert.match(message.html, /482913/);
});

test('email omits the delivery code section when none is provided', () => {
  const message = buildOrderConfirmationEmail(sampleOrder(), null);
  assert.doesNotMatch(message.text, /code de remise/i);
  assert.doesNotMatch(message.html, /Code de remise/);
});

test('email HTML escapes untrusted order fields', () => {
  const message = buildOrderConfirmationEmail(sampleOrder({
    customerName: '<script>alert(1)</script>',
    items: [{ name: '<img src=x onerror=alert(1)>', quantity: 1, lineTotal: 10 }]
  }), '111111');
  assert.doesNotMatch(message.html, /<script>/);
  assert.doesNotMatch(message.html, /<img src=x/);
  assert.match(message.html, /&lt;script&gt;/);
});

test('throws when the order has no customer email', () => {
  assert.throws(() => buildOrderConfirmationEmail(sampleOrder({ email: '' }), '123456'));
});
