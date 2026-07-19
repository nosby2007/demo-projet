'use strict';
const STATES = new Set(['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled']);
function clean(value, max = 160) { return String(value ?? '').trim().slice(0, max); }
function finite(value) { const number = Number(value); return Number.isFinite(number) ? number : 0; }
function normalizeCode(value) { return clean(value, 32).toUpperCase().replace(/[^A-Z0-9_-]/g, ''); }
function validateCampaign(input = {}, now = Date.now()) {
  const name = clean(input.name, 120); const code = normalizeCode(input.code); const type = input.type === 'fixed' ? 'fixed' : 'percent'; const value = finite(input.value); const budget = finite(input.budget); const startsAt = finite(input.startsAt); const endsAt = finite(input.endsAt);
  const errors = []; if (name.length < 3) errors.push('name'); if (code.length < 3) errors.push('code'); if (value <= 0 || (type === 'percent' && value > 100)) errors.push('value'); if (budget < 0) errors.push('budget'); if (startsAt < now - 60000 || endsAt <= startsAt) errors.push('window');
  return { valid: errors.length === 0, errors, campaign: { name, code, type, value, budget, startsAt, endsAt } };
}
function canTransition(status, action, row, now = Date.now()) {
  const allowed = { schedule: ['draft'], activate: ['draft', 'scheduled', 'paused'], pause: ['active'], resume: ['paused'], complete: ['active', 'paused'], cancel: ['draft', 'scheduled', 'active', 'paused'] };
  if (!allowed[action]?.includes(status)) return false; if (['activate', 'resume'].includes(action)) return finite(row.startsAt) <= now && finite(row.endsAt) > now; return true;
}
function campaignSummary(row = {}, now = Date.now()) {
  const status = STATES.has(row.status) ? row.status : 'draft'; const budget = finite(row.budget); const spent = Math.max(0, finite(row.spent));
  return { id: clean(row.id), name: clean(row.name, 120), code: normalizeCode(row.code), type: row.type === 'fixed' ? 'fixed' : 'percent', value: finite(row.value), budget, spent, remaining: Math.max(0, budget - spent), usageCount: Math.max(0, finite(row.usageCount)), startsAt: finite(row.startsAt), endsAt: finite(row.endsAt), status, expired: finite(row.endsAt) > 0 && finite(row.endsAt) <= now, updatedAt: finite(row.updatedAt || row.createdAt) };
}
function summarizeCampaigns(rows = [], now = Date.now()) { const campaigns = rows.map(row => campaignSummary(row, now)).sort((a, b) => b.updatedAt - a.updatedAt); return { campaigns, summary: { active: campaigns.filter(c => c.status === 'active').length, scheduled: campaigns.filter(c => c.status === 'scheduled').length, paused: campaigns.filter(c => c.status === 'paused').length, totalBudget: campaigns.reduce((s, c) => s + c.budget, 0), totalSpent: campaigns.reduce((s, c) => s + c.spent, 0) } }; }
module.exports = { STATES, campaignSummary, canTransition, normalizeCode, summarizeCampaigns, validateCampaign };
