/* Enterprise audit module for the SOKIVA operations control center. */
'use strict';

(function enterpriseAuditRuntime() {
  const ROOT_ID = 'enterprise-admin-root';
  const TENANT_ID = 'lamylenoise';
  let loading = false;

  function backend() {
    return window.SokivaFirebase || window.AfroMarketFirebase || null;
  }

  function callable(name) {
    const functions = backend()?.functions;
    if (!functions) throw new Error('Le service Firebase Functions est indisponible.');
    return functions.httpsCallable(name);
  }

  function messageFrom(error, fallback) {
    const raw = error?.details?.message || error?.message || fallback;
    return String(raw || fallback).replace(/^FirebaseError:\s*/i, '');
  }

  function formatDate(value) {
    const timestamp = Number(value || 0);
    if (!timestamp) return 'Date indisponible';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Asia/Dubai'
    }).format(new Date(timestamp));
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function icon(name) {
    const node = document.createElement('i');
    node.dataset.lucide = name;
    node.setAttribute('aria-hidden', 'true');
    return node;
  }

  function refreshIcons(scope) {
    if (scope && typeof window.lucide !== 'undefined') window.lucide.createIcons({ nodes: [scope] });
  }

  function createAuditRow(event) {
    const article = element('article', 'enterprise-admin-record enterprise-admin-audit-record');
    const main = element('div', 'enterprise-admin-record-main');
    const titleRow = element('div', 'enterprise-admin-record-title');
    titleRow.append(
      element('strong', '', event.action || 'audit.updated'),
      element('span', `enterprise-admin-pill ${event.outcome === 'success' ? 'active' : 'rejected'}`, event.outcome || 'success')
    );
    main.append(
      titleRow,
      element('p', '', `${event.entityType || 'entity'} · ${event.entityId || 'identifiant indisponible'}`),
      element('small', '', `${formatDate(event.createdAt)} · Auteur: ${event.actorUid || 'system'}${Array.isArray(event.changedKeys) && event.changedKeys.length ? ` · Champs: ${event.changedKeys.join(', ')}` : ''}`)
    );

    const details = document.createElement('details');
    const summary = element('summary', '', 'Voir les changements expurges');
    const pre = element('pre', 'audit-json');
    pre.textContent = JSON.stringify({
      before: event.before || null,
      after: event.after || null,
      metadata: event.metadata || null
    }, null, 2);
    details.append(summary, pre);
    article.append(main, details);
    return article;
  }

  function setActiveTab(tabName) {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    root.querySelectorAll('[data-enterprise-tab]').forEach(button => {
      button.classList.toggle('active', button.dataset.enterpriseTab === tabName);
    });
    root.querySelectorAll('[data-enterprise-panel]').forEach(panel => {
      panel.classList.toggle('active', panel.dataset.enterprisePanel === tabName);
    });
  }

  async function loadEvents(panel) {
    if (loading) return;
    loading = true;
    const list = panel.querySelector('[data-enterprise-audit-list]');
    const status = panel.querySelector('[data-enterprise-audit-status]');
    const refresh = panel.querySelector('[data-enterprise-audit-refresh]');
    const entityType = panel.querySelector('[data-enterprise-audit-entity]')?.value || '';
    const entityId = panel.querySelector('[data-enterprise-audit-id]')?.value.trim() || '';
    refresh.disabled = true;
    status.textContent = 'Chargement du journal securise...';
    list.replaceChildren();
    try {
      const response = await callable('listAuditEventsEnterprise')({
        tenantId: TENANT_ID,
        limit: 100,
        entityType,
        entityId
      });
      const events = Array.isArray(response.data?.events) ? response.data.events : [];
      status.textContent = `${events.length} evenement(s) recent(s)`;
      if (!events.length) {
        const empty = element('div', 'enterprise-admin-empty');
        empty.append(icon('file-clock'), element('strong', '', 'Aucun evenement'), element('span', '', 'Aucune trace ne correspond aux filtres selectionnes.'));
        list.append(empty);
      } else {
        events.forEach(event => list.append(createAuditRow(event)));
      }
      panel.dataset.auditLoaded = 'true';
      refreshIcons(panel);
    } catch (error) {
      status.textContent = messageFrom(error, 'Impossible de charger le journal d audit.');
      if (window.Toast?.show) window.Toast.show(status.textContent, 'error', 'alert-circle');
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  function buildPanel() {
    const panel = element('section', 'enterprise-admin-panel');
    panel.dataset.enterprisePanel = 'audit';

    const card = element('article', 'enterprise-admin-card');
    const header = document.createElement('header');
    const heading = document.createElement('div');
    heading.append(element('span', '', 'Governance et tracabilite'), element('h3', '', 'Journal d audit serveur'));
    const status = element('small', '', 'Chargement a la demande');
    status.dataset.enterpriseAuditStatus = 'true';
    header.append(heading, status);

    const filters = element('div', 'enterprise-admin-audit-filters');
    const typeLabel = element('label', 'enterprise-admin-audit-field');
    typeLabel.append(element('span', '', 'Type d entite'));
    const select = document.createElement('select');
    select.dataset.enterpriseAuditEntity = 'true';
    [
      ['', 'Toutes les entites'],
      ['order', 'Commandes'],
      ['product', 'Produits'],
      ['role_request', 'Candidatures'],
      ['profile', 'Profils et roles'],
      ['delivery_job', 'Livraisons'],
      ['earning', 'Revenus']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.append(option);
    });
    typeLabel.append(select);

    const idLabel = element('label', 'enterprise-admin-audit-field');
    idLabel.append(element('span', '', 'Identifiant exact'));
    const idInput = document.createElement('input');
    idInput.dataset.enterpriseAuditId = 'true';
    idInput.placeholder = 'Commande, produit ou utilisateur';
    idInput.autocomplete = 'off';
    idLabel.append(idInput);

    const refresh = element('button', 'btn-primary', 'Actualiser le journal');
    refresh.type = 'button';
    refresh.dataset.enterpriseAuditRefresh = 'true';
    filters.append(typeLabel, idLabel, refresh);

    const list = element('div', 'enterprise-admin-list');
    list.dataset.enterpriseAuditList = 'true';
    const empty = element('div', 'enterprise-admin-empty');
    empty.append(icon('file-clock'), element('strong', '', 'Journal charge a la demande'), element('span', '', 'Ouvrez ce module pour consulter les traces expurgees.'));
    list.append(empty);

    card.append(header, filters, list);
    panel.append(card);
    refresh.addEventListener('click', () => loadEvents(panel));
    select.addEventListener('change', () => loadEvents(panel));
    idInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') loadEvents(panel);
    });
    return panel;
  }

  function enhance() {
    const root = document.getElementById(ROOT_ID);
    const nav = root?.querySelector('.enterprise-admin-nav');
    const workspace = root?.querySelector('.enterprise-admin-workspace');
    if (!nav || !workspace || nav.querySelector('[data-enterprise-tab="audit"]')) return;

    const button = element('button');
    button.type = 'button';
    button.dataset.enterpriseTab = 'audit';
    button.append(icon('file-search-2'), element('span', '', 'Audit et conformite'));
    const panel = buildPanel();
    nav.append(button);
    workspace.append(panel);
    button.addEventListener('click', () => {
      setActiveTab('audit');
      if (panel.dataset.auditLoaded !== 'true') loadEvents(panel);
    });
    refreshIcons(root);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true });
    enhance();
  });
})();
