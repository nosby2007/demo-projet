/* Trusted, privacy-minimized Risk & Fraud Operations workspace. */
'use strict';
(function () {
  const TENANT = 'lamylenoise'; let loading = false;
  const backend = () => window.SokivaFirebase || window.AfroMarketFirebase;
  const call = name => backend().functions.httpsCallable(name);
  function el(tag, className, value) { const node = document.createElement(tag); if (className) node.className = className; if (value !== undefined) node.textContent = value; return node; }
  function toast(message, type = 'success') { window.Toast?.show(message, type, type === 'error' ? 'alert-circle' : 'shield-alert'); }
  function action(label, name, item, needsReason = false) {
    const button = el('button', 'btn-link', label); button.type = 'button';
    button.addEventListener('click', async () => {
      let reason = '';
      if (needsReason) { reason = prompt('Motif administratif obligatoire (5 caracteres minimum)') || ''; if (reason.trim().length < 5) return; }
      button.disabled = true;
      try { await call('updateAdminRiskCase')({ tenantId: TENANT, caseId: item.id, action: name, reason }); toast('Decision risque enregistree.'); await load(); }
      catch (error) { button.disabled = false; toast(error.message || 'Decision impossible.', 'error'); }
    });
    return button;
  }
  function row(item) {
    const article = el('article', 'enterprise-admin-record'); const main = el('div', 'enterprise-admin-record-main'); const title = el('div', 'enterprise-admin-record-title');
    title.append(el('strong', '', `${item.subjectType} · ${item.subjectRef}`), el('span', `enterprise-admin-pill ${item.level === 'critical' ? 'rejected' : 'pending'}`, `${item.score}/100 · ${item.level}`), el('span', `enterprise-admin-pill ${item.status}`, item.status));
    main.append(title, el('p', '', item.signals.map(signal => `${signal.label} (+${signal.weight})`).join(' · ') || 'Aucun signal expose'), el('small', '', `${item.assignedAdminUid ? 'Assignee' : 'Non assignee'}${item.newSignalsPending ? ' · Nouveaux signaux' : ''}`));
    const actions = el('div', 'enterprise-admin-record-actions');
    if (!item.assignedAdminUid && ['open', 'in_review', 'escalated'].includes(item.status)) actions.append(action('Me l assigner', 'assign_self', item));
    if (['open', 'escalated'].includes(item.status)) actions.append(action('Examiner', 'review', item));
    if (['open', 'in_review', 'escalated', 'restricted'].includes(item.status)) actions.append(action('Lever le risque', 'clear', item, true));
    if (['open', 'in_review', 'escalated'].includes(item.status)) actions.append(action('Restreindre', 'restrict', item, true));
    if (['open', 'in_review'].includes(item.status)) actions.append(action('Escalader', 'escalate', item, true));
    if (['cleared', 'restricted'].includes(item.status)) actions.append(action('Reouvrir', 'reopen', item, true));
    article.append(main, actions); return article;
  }
  async function load() {
    if (loading) return; loading = true;
    const panel = document.querySelector('[data-enterprise-panel="risk"]'); const list = panel?.querySelector('[data-risk-list]'); const status = panel?.querySelector('[data-risk-status]');
    if (!list) { loading = false; return; } list.replaceChildren(el('div', 'enterprise-admin-state', 'Chargement de la file risque...'));
    try { const response = await call('getAdminRiskQueue')({ tenantId: TENANT, limit: 150 }); const data = response.data; status.textContent = `${data.summary.active} actives · ${data.summary.critical} critiques · ${data.summary.restricted} restreintes`; list.replaceChildren(...(data.cases.length ? data.cases.map(row) : [el('div', 'enterprise-admin-empty', 'Aucune alerte risque.')])); }
    catch (error) { list.replaceChildren(el('div', 'enterprise-admin-state enterprise-admin-state-error', error.message || 'File risque indisponible.')); }
    finally { loading = false; }
  }
  function enhance() {
    const root = document.getElementById('enterprise-admin-root'); const nav = root?.querySelector('.enterprise-admin-nav'); const workspace = root?.querySelector('.enterprise-admin-workspace');
    if (!nav || !workspace || nav.querySelector('[data-enterprise-tab="risk"]')) return;
    const button = el('button'); button.type = 'button'; button.dataset.enterpriseTab = 'risk'; button.append(el('span', '', '🛡️'), el('span', '', 'Risque & fraude'));
    const panel = el('section', 'enterprise-admin-panel'); panel.dataset.enterprisePanel = 'risk'; const card = el('article', 'enterprise-admin-card'); const header = document.createElement('header'); const heading = el('div');
    heading.append(el('span', '', 'Risk Operations'), el('h3', '', 'Signaux explicables et decisions')); const status = el('small', '', 'Chargement a la demande'); status.dataset.riskStatus = 'true'; header.append(heading, status);
    const list = el('div', 'enterprise-admin-list'); list.dataset.riskList = 'true'; card.append(header, list); panel.append(card); nav.append(button); workspace.append(panel);
    button.addEventListener('click', () => { root.querySelectorAll('[data-enterprise-tab]').forEach(node => node.classList.toggle('active', node === button)); root.querySelectorAll('[data-enterprise-panel]').forEach(node => node.classList.toggle('active', node === panel)); load(); });
  }
  document.addEventListener('DOMContentLoaded', () => { const root = document.getElementById('enterprise-admin-root'); if (!root) return; new MutationObserver(enhance).observe(root, { childList: true, subtree: true }); enhance(); });
})();
