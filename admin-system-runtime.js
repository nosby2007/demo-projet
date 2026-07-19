/* Trusted System Health & Cost Telemetry workspace. */
'use strict';
(function () {
  const TENANT = 'lamylenoise'; let loading = false;
  const backend = () => window.SokivaFirebase || window.AfroMarketFirebase;
  const call = name => backend().functions.httpsCallable(name);
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function age(value) { if (!value) return 'indisponible'; const minutes = Math.max(0, Math.round((Date.now() - value) / 60000)); return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`; }
  function toast(message, type = 'success') { window.Toast?.show(message, type, type === 'error' ? 'alert-circle' : 'activity'); }
  function render(data, panel) {
    const health = data.health; const overview = panel.querySelector('[data-system-overview]'); const checks = panel.querySelector('[data-system-checks]'); const history = panel.querySelector('[data-system-history]');
    overview.replaceChildren();
    for (const [label, value, note] of [['Etat global', health.status, 'Synthese serveur'], ['Unites de lecture', health.capacity.estimatedReadUnits, 'Estimation, pas une facture'], ['Dernier audit', age(health.freshness.latestAuditAt), 'Fraicheur du journal'], ['Echantillons', data.history.length, 'Historique conserve']]) {
      const card = el('div', 'enterprise-admin-mini-stat'); card.append(el('span', '', label), el('strong', '', String(value)), el('small', '', note)); overview.append(card);
    }
    checks.replaceChildren(...health.checks.map(check => { const row = el('article', 'enterprise-admin-record'); const main = el('div', 'enterprise-admin-record-main'); const title = el('div', 'enterprise-admin-record-title'); title.append(el('strong', '', check.label), el('span', `enterprise-admin-pill ${check.status === 'critical' ? 'rejected' : check.status === 'degraded' ? 'pending' : 'active'}`, check.status)); main.append(title, el('small', '', check.unit === 'ms' ? `Age ${Math.round(check.value / 3600000)} h` : `${check.value} occurrence(s)`)); row.append(main); return row; }));
    history.replaceChildren(...(data.history.length ? data.history.slice().reverse().map(sample => { const row = el('article', 'enterprise-admin-record'); const main = el('div', 'enterprise-admin-record-main'); main.append(el('strong', '', new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(sample.generatedAt))), el('p', '', `${sample.checkCounts.healthy} sains · ${sample.checkCounts.degraded} dégradés · ${sample.checkCounts.critical} critiques`), el('small', '', `${sample.estimatedReadUnits} unités estimées`)); row.append(main, el('span', `enterprise-admin-pill ${sample.status === 'critical' ? 'rejected' : sample.status === 'degraded' ? 'pending' : 'active'}`, sample.status)); return row; }) : [el('div', 'enterprise-admin-empty', 'Aucun snapshot enregistré.') ]));
  }
  async function load() {
    if (loading) return; loading = true; const panel = document.querySelector('[data-enterprise-panel="system"]'); const state = panel?.querySelector('[data-system-state]'); if (!panel || !state) { loading = false; return; }
    state.textContent = 'Actualisation serveur...';
    try { const response = await call('getAdminSystemHealth')({ tenantId: TENANT }); render(response.data, panel); state.textContent = `Mis à jour à ${new Date(response.data.health.generatedAt).toLocaleTimeString('fr-FR')}`; }
    catch (error) { state.textContent = error.message || 'Télémétrie indisponible.'; toast(state.textContent, 'error'); }
    finally { loading = false; }
  }
  function enhance() {
    const root = document.getElementById('enterprise-admin-root'); const nav = root?.querySelector('.enterprise-admin-nav'); const workspace = root?.querySelector('.enterprise-admin-workspace'); if (!nav || !workspace || nav.querySelector('[data-enterprise-tab="system"]')) return;
    const button = el('button'); button.type = 'button'; button.dataset.enterpriseTab = 'system'; button.append(el('span', '', '📡'), el('span', '', 'Santé système'));
    const panel = el('section', 'enterprise-admin-panel'); panel.dataset.enterprisePanel = 'system'; const card = el('article', 'enterprise-admin-card'); const header = document.createElement('header'); const heading = el('div'); heading.append(el('span', '', 'System Health'), el('h3', '', 'Santé et télémétrie de capacité')); const controls = el('div', 'enterprise-admin-record-actions'); const state = el('small', '', 'Chargement à la demande'); state.dataset.systemState = 'true'; const capture = el('button', 'btn-link', 'Capturer'); capture.type = 'button'; capture.addEventListener('click', async () => { capture.disabled = true; try { await call('captureAdminSystemHealth')({ tenantId: TENANT }); toast('Snapshot système enregistré.'); await load(); } catch (error) { toast(error.message || 'Capture impossible.', 'error'); } finally { capture.disabled = false; } }); controls.append(state, capture); header.append(heading, controls);
    const overview = el('div', 'enterprise-admin-trend-summary'); overview.dataset.systemOverview = 'true'; const checksTitle = el('h4', '', 'Contrôles opérationnels'); const checks = el('div', 'enterprise-admin-list'); checks.dataset.systemChecks = 'true'; const historyTitle = el('h4', '', 'Historique des snapshots'); const history = el('div', 'enterprise-admin-list'); history.dataset.systemHistory = 'true'; card.append(header, overview, checksTitle, checks, historyTitle, history); panel.append(card); nav.append(button); workspace.append(panel);
    button.addEventListener('click', () => { root.querySelectorAll('[data-enterprise-tab]').forEach(node => node.classList.toggle('active', node === button)); root.querySelectorAll('[data-enterprise-panel]').forEach(node => node.classList.toggle('active', node === panel)); load(); });
  }
  document.addEventListener('DOMContentLoaded', () => { const root = document.getElementById('enterprise-admin-root'); if (!root) return; new MutationObserver(enhance).observe(root, { childList: true, subtree: true }); enhance(); });
})();
