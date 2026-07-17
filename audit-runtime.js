/* SOKIVA administrator audit console. */
'use strict';

(function auditConsoleRuntime() {
  if (!window.MarketplaceData || typeof window.MarketplacePages === 'undefined') {
    console.warn('Marketplace runtime must load before audit-runtime.js');
    return;
  }

  const TENANT_ID = 'lamylenoise';

  function callable(name) {
    const functions = window.SokivaFirebase?.functions || window.AfroMarketFirebase?.functions;
    if (!functions) throw new Error('Le service d’audit sécurisé est indisponible.');
    return functions.httpsCallable(name);
  }

  function messageFrom(error, fallback) {
    const raw = error?.details?.message || error?.message || fallback;
    return String(raw).replace(/^FirebaseError:\s*/i, '');
  }

  function formatDate(timestamp) {
    const value = Number(timestamp || 0);
    if (!value) return 'Date indisponible';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
      timeZone: 'Asia/Dubai'
    }).format(new Date(value));
  }

  MarketplaceData.listAuditEvents = async function listAuditEvents(filters = {}) {
    try {
      const response = await callable('listAuditEvents')({
        tenantId: TENANT_ID,
        limit: Number(filters.limit || 100),
        entityType: filters.entityType || '',
        action: filters.action || '',
        entityId: filters.entityId || ''
      });
      return Array.isArray(response.data?.events) ? response.data.events : [];
    } catch (error) {
      throw new Error(messageFrom(error, 'Impossible de charger le journal d’audit.'));
    }
  };

  function createField(labelText, control) {
    const label = document.createElement('label');
    label.className = 'form-field';
    const labelSpan = document.createElement('span');
    labelSpan.textContent = labelText;
    label.append(labelSpan, control);
    return label;
  }

  function createAuditRow(event) {
    const article = document.createElement('article');
    article.className = 'admin-record';

    const summary = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = event.action || 'audit.updated';
    const description = document.createElement('p');
    description.textContent = `${event.entityType || 'entité'} · ${event.entityId || 'identifiant indisponible'}`;
    const metadata = document.createElement('small');
    const changed = Array.isArray(event.changedKeys) && event.changedKeys.length
      ? ` · Champs: ${event.changedKeys.join(', ')}`
      : '';
    metadata.textContent = `${formatDate(event.createdAt)} · Auteur: ${event.actorUid || 'system'}${changed}`;
    summary.append(title, description, metadata);

    const outcome = document.createElement('span');
    outcome.className = `status-pill ${event.outcome === 'success' ? 'active' : 'rejected'}`;
    outcome.textContent = event.outcome || 'success';

    const details = document.createElement('details');
    const detailsSummary = document.createElement('summary');
    detailsSummary.textContent = 'Voir les changements expurgés';
    const pre = document.createElement('pre');
    pre.className = 'audit-json';
    pre.textContent = JSON.stringify({
      before: event.before || null,
      after: event.after || null,
      metadata: event.metadata || null
    }, null, 2);
    details.append(detailsSummary, pre);

    article.append(summary, outcome, details);
    return article;
  }

  async function loadEvents(section) {
    const list = section.querySelector('[data-audit-list]');
    const status = section.querySelector('[data-audit-status]');
    const entityType = section.querySelector('[data-audit-entity]')?.value || '';
    const entityId = section.querySelector('[data-audit-id]')?.value.trim() || '';
    const refresh = section.querySelector('[data-audit-refresh]');

    if (refresh) refresh.disabled = true;
    status.textContent = 'Chargement du journal sécurisé…';
    list.replaceChildren();
    try {
      const events = await MarketplaceData.listAuditEvents({ entityType, entityId, limit: 100 });
      status.textContent = `${events.length} événement(s) récent(s)`;
      if (!events.length) {
        const empty = document.createElement('p');
        empty.className = 'muted';
        empty.textContent = 'Aucun événement ne correspond aux filtres.';
        list.append(empty);
      } else {
        events.forEach(event => list.append(createAuditRow(event)));
      }
    } catch (error) {
      status.textContent = error.message;
      if (typeof Toast !== 'undefined') Toast.show(error.message, 'error', 'alert-circle');
    } finally {
      if (refresh) refresh.disabled = false;
    }
  }

  function appendAuditPanel(root) {
    const section = document.createElement('section');
    section.className = 'ops-panel';
    section.dataset.auditPanel = 'true';

    const heading = document.createElement('h2');
    heading.textContent = 'Journal d’audit et traçabilité';
    const intro = document.createElement('p');
    intro.className = 'muted';
    intro.textContent = 'Historique serveur immuable des commandes, produits, rôles, profils, livraisons et revenus.';

    const filters = document.createElement('div');
    filters.className = 'form-row';
    const entitySelect = document.createElement('select');
    entitySelect.dataset.auditEntity = 'true';
    [
      ['', 'Toutes les entités'],
      ['order', 'Commandes'],
      ['product', 'Produits'],
      ['role_request', 'Candidatures'],
      ['profile', 'Profils et rôles'],
      ['delivery_job', 'Livraisons'],
      ['earning', 'Revenus']
    ].forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      entitySelect.append(option);
    });

    const entityInput = document.createElement('input');
    entityInput.dataset.auditId = 'true';
    entityInput.placeholder = 'ID commande, produit ou utilisateur';
    entityInput.autocomplete = 'off';
    filters.append(
      createField('Type', entitySelect),
      createField('Identifiant précis', entityInput)
    );

    const refresh = document.createElement('button');
    refresh.type = 'button';
    refresh.className = 'btn-primary';
    refresh.dataset.auditRefresh = 'true';
    refresh.textContent = 'Actualiser le journal';

    const status = document.createElement('p');
    status.className = 'muted';
    status.dataset.auditStatus = 'true';
    const list = document.createElement('div');
    list.className = 'ops-table';
    list.dataset.auditList = 'true';

    section.append(heading, intro, filters, refresh, status, list);
    root.append(section);
    refresh.addEventListener('click', () => loadEvents(section));
    entitySelect.addEventListener('change', () => loadEvents(section));
    entityInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') loadEvents(section);
    });
    loadEvents(section);
  }

  const originalRenderAdmin = MarketplacePages.renderAdmin.bind(MarketplacePages);
  MarketplacePages.renderAdmin = async function auditAwareAdmin(root) {
    await originalRenderAdmin(root);
    appendAuditPanel(root);
  };
})();
