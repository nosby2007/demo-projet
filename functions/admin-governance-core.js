'use strict';

const PERMISSIONS = Object.freeze(['dashboard.read','access.read','access.write','orders.write','finance.read','finance.write','analytics.write','audit.read','support.read','support.write','risk.read','risk.write','system.read','system.write','campaign.read','campaign.write','delegatedAdmin.read','insights.generate']);
const SET = new Set(PERMISSIONS);
function clean(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
function normalizePermissions(values = []) { return [...new Set(Array.isArray(values) ? values : [])].map(v => clean(v, 80)).filter(v => SET.has(v)).sort(); }
function maskEmail(value) { const [name, domain] = clean(value, 200).split('@'); return domain ? `${name.slice(0, 2)}***@${domain}` : ''; }
function adminSummary(row = {}) { return { uid: clean(row.uid), name: clean(row.name, 120), emailMasked: maskEmail(row.email), status: row.status === 'disabled' ? 'disabled' : 'active', isSuperAdmin: row.isSuperAdmin === true, permissions: row.isSuperAdmin === true ? ['*'] : normalizePermissions(Object.entries(row.adminPermissions || {}).filter(([, enabled]) => enabled === true).map(([key]) => key)), claimsSyncStatus: clean(row.claimsSyncStatus || 'complete', 40), updatedAt: Number(row.updatedAt || 0) }; }
function candidateSummary(row = {}, authUser = {}) { return { uid: clean(row.uid), name: clean(row.name, 120), emailMasked: maskEmail(row.email || authUser.email), role: ['customer', 'seller', 'courier'].includes(row.role) ? row.role : 'customer', status: row.status === 'disabled' ? 'disabled' : row.status === 'pending_verification' ? 'pending_verification' : 'active', emailVerified: authUser.emailVerified === true, eligible: authUser.emailVerified === true && row.status !== 'disabled', updatedAt: Number(row.updatedAt || 0) }; }
function permissionMap(values) { return Object.fromEntries(normalizePermissions(values).map(value => [value, true])); }
module.exports = { PERMISSIONS, adminSummary, candidateSummary, maskEmail, normalizePermissions, permissionMap };
