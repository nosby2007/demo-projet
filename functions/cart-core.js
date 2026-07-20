'use strict';

const MAX_LINES = 50;
const MAX_QUANTITY = 99;

function clean(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
function productKey(value) { const raw = clean(value); return /^\d+$/.test(raw) ? `catalog-${raw}` : raw; }
function quantity(value) { const number = Number.parseInt(value, 10); return Number.isInteger(number) ? Math.min(MAX_QUANTITY, Math.max(0, number)) : 0; }
function normalizeLines(items = []) {
  const lines = {};
  for (const item of Array.isArray(items) ? items.slice(0, MAX_LINES * 2) : []) {
    const id = productKey(item?.productId || item?.id);
    const qty = quantity(item?.quantity ?? item?.qty);
    if (!id || !qty) continue;
    lines[id] = Math.min(MAX_QUANTITY, (lines[id] || 0) + qty);
    if (Object.keys(lines).length > MAX_LINES) throw new Error('too-many-lines');
  }
  return lines;
}
function mergeLines(current = {}, incoming = {}) {
  const result = {};
  for (const [id, qty] of Object.entries(current || {})) if (productKey(id) && quantity(qty)) result[productKey(id)] = quantity(qty);
  for (const [id, qty] of Object.entries(incoming || {})) result[productKey(id)] = Math.min(MAX_QUANTITY, (result[productKey(id)] || 0) + quantity(qty));
  if (Object.keys(result).length > MAX_LINES) throw new Error('too-many-lines');
  return result;
}
function cartCount(lines = {}) { return Object.values(lines).reduce((sum, value) => sum + quantity(value), 0); }

module.exports = { MAX_LINES, MAX_QUANTITY, cartCount, mergeLines, normalizeLines, productKey, quantity };
