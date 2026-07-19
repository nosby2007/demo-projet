/* SOKIVA enterprise operations control center. */
'use strict';

window.SokivaEnterpriseAdmin = Object.freeze({ enabled: true, version: '1.0.0' });

(function enterpriseAdminRuntime() {
  const ROOT_ID = 'enterprise-admin-root';
  const TENANT_ID = 'lamylenoise';
  const state = { data: null, loading: false, activeTab: 'overview', decision: null };

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

  function notify(message, tone = 'default', icon = 'info') {
    if (window.Toast?.show) window.Toast.show(message, tone, icon, 5000);
    else console[tone === 'error' ? 'error' : 'log'](message);
  }

  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[character]));
  }

  function money(value) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'AED', maximumFractionDigits: 2
    }).format(Number(value || 0));
  }

  function percent(value) {
    return new Intl.NumberFormat('fr-FR', {
      style: 'percent', maximumFractionDigits: 1
    }).format(Number(value || 0));
  }

  function dateTime(value) {
    if (!value) return 'Non disponible';
    const date = new Date(Number(value));
    if (Number.isNaN(date.getTime())) return 'Non disponible';
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(date);
  }

  function statusLabel(value) {
    return {
      pending: 'En attente', approved: 'Approuvee', rejected: 'Rejetee',
      pending_review: 'A verifier', active: 'Actif', disabled: 'Desactive',
      confirmed: 'Confirmee', preparing: 'En preparation', ready_for_pickup: 'Prete au retrait',
      in_transit: 'En livraison', delivered: 'Livree', cancelled: 'Annulee', refunded: 'Remboursee',
      pending_cod: 'COD a collecter', paid: 'Paye', collected: 'Collecte', settled: 'Regle'
    }[value] || value || 'Non defini';
  }

  function root() {
    return document.getElementById(ROOT_ID);
  }

  function icon(name) {
    return `<i data-lucide="${escape(name)}" aria-hidden="true"></i>`;
  }

  function refreshIcons(scope = root()) {
    if (scope && typeof window.lucide !== 'undefined') window.lucide.createIcons({ nodes: [scope] });
  }

  function renderLoading() {
    const target = root();
    if (!target) return;
    target.innerHTML = `
      <section class="enterprise-admin-state" aria-live="polite">
        <div class="enterprise-admin-spinner" aria-hidden="true"></div>
        <h2>Chargement du centre de commandement</h2>
        <p>Verification des droits, consolidation des operations et calcul des indicateurs.</p>
      </section>`;
  }

  function renderError(error) {
    const target = root();
    if (!target) return;
    const message = messageFrom(error, 'Le centre de commandement n a pas pu etre charge.');
    target.innerHTML = `
      <section class="enterprise-admin-state enterprise-admin-state-error" role="alert">
        ${icon('shield-alert')}
        <h2>Centre de commandement indisponible</h2>
        <p>${escape(message)}</p>
        <div class="enterprise-admin-state-actions">
          <button class="btn-primary" type="button" id="enterprise-admin-retry">Reessayer</button>
          <a class="btn-link" href="account.html">Verifier mon compte</a>
        </div>
      </section>`;
    target.querySelector('#enterprise-admin-retry')?.addEventListener('click', loadDashboard);
    refreshIcons(target);
  }

  function kpi(iconName, value, label, hint, tone = '') {
    return `
      <article class="enterprise-admin-kpi ${escape(tone)}">
        <span class="enterprise-admin-kpi-icon">${icon(iconName)}</span>
        <div>
          <strong>${escape(value)}</strong>
          <span>${escape(label)}</span>
          <small>${escape(hint)}</small>
        </div>
      </article>`;
  }

  function emptyState(iconName, title, message) {
    return `
      <div class="enterprise-admin-empty">
        ${icon(iconName)}
        <strong>${escape(title)}</strong>
        <span>${escape(message)}</span>
      </div>`;
  }

  function warningList(warnings) {
    if (!warnings?.length) {
      return `<div class="enterprise-admin-health-ok">${icon('shield-check')} Aucun avertissement critique detecte.</div>`;
    }
    return `<div class="enterprise-admin-warning-list">${warnings.map(warning => `
      <div>${icon('triangle-alert')}<span>${escape(warning.replaceAll('_', ' '))}</span></div>`).join('')}</div>`;
  }

  function roleRequestRow(request) {
    const canDecide = request.status === 'pending';
    return `
      <article class="enterprise-admin-record">
        <div class="enterprise-admin-record-main">
          <div class="enterprise-admin-record-title">
            <strong>${escape(request.businessName || request.name || 'Candidature')}</strong>
            <span class="enterprise-admin-pill ${escape(request.status)}">${escape(statusLabel(request.status))}</span>
          </div>
          <p>${escape(request.type)} · ${escape(request.city || 'Ville non renseignee')}</p>
          <small>${escape(request.email || '')}${request.phone ? ` · ${escape(request.phone)}` : ''} · ${escape(dateTime(request.createdAt))}</small>
          ${request.claimsSyncStatus === 'failed' ? `<em class="enterprise-admin-inline-error">Synchronisation des droits en echec: ${escape(request.claimsSyncError)}</em>` : ''}
        </div>
        ${canDecide ? `<div class="enterprise-admin-record-actions">
          <button class="btn-link" type="button" data-role-approve="${escape(request.id)}" data-role-type="${escape(request.type)}">Approuver</button>
          <button class="btn-link danger" type="button" data-role-reject="${escape(request.id)}">Rejeter</button>
        </div>` : ''}
      </article>`;
  }

  function orderRow(order) {
    return `
      <article class="enterprise-admin-record enterprise-admin-order-row">
        <div class="enterprise-admin-record-main">
          <div class="enterprise-admin-record-title">
            <strong>${escape(order.id)}</strong>
            <span class="enterprise-admin-pill ${escape(order.status)}">${escape(statusLabel(order.status))}</span>
          </div>
          <p>${escape(order.customerLabel)} · ${escape(order.emirate || 'Emirat non renseigne')} · ${order.sellerCount} vendeur(s)</p>
          <small>${escape(dateTime(order.createdAt))} · ${escape(statusLabel(order.paymentStatus))}${order.courierAssigned ? ' · Livreur affecte' : ' · Sans livreur'}</small>
        </div>
        <div class="enterprise-admin-record-money">
          <strong>${escape(money(order.total))}</strong>
          <small>P ${escape(money(order.payout?.platform))} · L ${escape(money(order.payout?.courier))} · V ${escape(money(order.payout?.seller))}</small>
        </div>
      </article>`;
  }

  function productRow(product, reason) {
    return `
      <article class="enterprise-admin-record">
        <div class="enterprise-admin-record-main">
          <div class="enterprise-admin-record-title">
            <strong>${escape(product.name || 'Produit')}</strong>
            <span class="enterprise-admin-pill ${escape(product.status)}">${escape(statusLabel(product.status))}</span>
          </div>
          <p>${escape(product.sellerName || 'Vendeur')} · ${escape(product.category || 'Sans categorie')}</p>
          <small>${escape(reason)} · Stock ${Number(product.stockAvailable || 0)}</small>
        </div>
        <div class="enterprise-admin-record-money"><strong>${escape(money(product.price))}</strong></div>
      </article>`;
  }

  function panelOverview(data) {
    const executive = data.executive;
    const statuses = data.operations.orderStatusCounts || {};
    return `
      <section class="enterprise-admin-panel active" data-enterprise-panel="overview">
        <div class="enterprise-admin-grid two">
          <article class="enterprise-admin-card">
            <header><div><span>Flux operationnel</span><h3>Commandes par statut</h3></div><small>${executive.orderCount} total</small></header>
            <div class="enterprise-admin-status-grid">
              ${['confirmed','preparing','ready_for_pickup','in_transit','delivered','cancelled'].map(status => `
                <div><span>${escape(statusLabel(status))}</span><strong>${Number(statuses[status] || 0)}</strong></div>`).join('')}
            </div>
          </article>
          <article class="enterprise-admin-card">
            <header><div><span>Qualite operationnelle</span><h3>Alertes et garde-fous</h3></div><small>${data.security.warnings.length} alerte(s)</small></header>
            ${warningList(data.security.warnings)}
          </article>
        </div>
        <article class="enterprise-admin-card">
          <header><div><span>Activite recente</span><h3>Dernieres commandes</h3></div><button class="btn-link" type="button" data-enterprise-tab-target="orders">Voir tout</button></header>
          <div class="enterprise-admin-list">${data.operations.recentOrders.slice(0, 8).map(orderRow).join('') || emptyState('package-open', 'Aucune commande', 'Les premieres commandes apparaitront ici.')}</div>
        </article>
      </section>`;
  }

  function panelAccess(data) {
    return `
      <section class="enterprise-admin-panel" data-enterprise-panel="access">
        <article class="enterprise-admin-card">
          <header><div><span>IAM et onboarding</span><h3>Candidatures vendeur et livreur</h3></div><small>${data.access.pendingCount} en attente</small></header>
          <div class="enterprise-admin-list">${data.access.recentRequests.map(roleRequestRow).join('') || emptyState('badge-check', 'Aucune candidature', 'Les demandes professionnelles apparaitront ici.')}</div>
        </article>
      </section>`;
  }

  function panelOrders(data) {
    return `
      <section class="enterprise-admin-panel" data-enterprise-panel="orders">
        <article class="enterprise-admin-card">
          <header><div><span>Order management</span><h3>Commandes recentes</h3></div><small>${data.executive.activeOrders} active(s)</small></header>
          <div class="enterprise-admin-list">${data.operations.recentOrders.map(orderRow).join('') || emptyState('shopping-bag', 'Aucune commande', 'Le pipeline est pret a recevoir les commandes clients.')}</div>
        </article>
      </section>`;
  }

  function panelMarketplace(data) {
    const roles = data.marketplace.profileRoleCounts || {};
    return `
      <section class="enterprise-admin-panel" data-enterprise-panel="marketplace">
        <div class="enterprise-admin-grid four enterprise-admin-role-grid">
          ${['customer','seller','courier','admin'].map(role => `<article class="enterprise-admin-mini-stat"><span>${escape(role)}</span><strong>${Number(roles[role] || 0)}</strong></article>`).join('')}
        </div>
        <div class="enterprise-admin-grid two">
          <article class="enterprise-admin-card">
            <header><div><span>Moderation</span><h3>Produits a verifier</h3></div><small>${data.marketplace.pendingProductCount}</small></header>
            <div class="enterprise-admin-list">${data.marketplace.pendingProducts.map(product => productRow(product, 'Validation requise')).join('') || emptyState('badge-check', 'Aucun produit en attente', 'La file de moderation est a jour.')}</div>
          </article>
          <article class="enterprise-admin-card">
            <header><div><span>Inventaire</span><h3>Stock faible</h3></div><small>${data.marketplace.lowStockCount}</small></header>
            <div class="enterprise-admin-list">${data.marketplace.lowStockProducts.map(product => productRow(product, 'Seuil de reapprovisionnement atteint')).join('') || emptyState('boxes', 'Stock sous controle', 'Aucun produit actif sous le seuil critique.')}</div>
          </article>
        </div>
      </section>`;
  }

  function panelFinance(data) {
    const executive = data.executive;
    return `
      <section class="enterprise-admin-panel" data-enterprise-panel="finance">
        <div class="enterprise-admin-grid four">
          ${kpi('landmark', money(executive.expectedPlatformRevenue), 'Commission attendue', '15% sur commandes non annulees')}
          ${kpi('badge-dollar-sign', money(executive.recognizedPlatformRevenue), 'Revenu reconnu', 'Commandes livrees et encaissees', 'success')}
          ${kpi('store', money(executive.expectedSellerPayout), 'Dette vendeurs', '75% a reverser')}
          ${kpi('truck', money(executive.expectedCourierPayout), 'Dette livreurs', '10% a reverser')}
        </div>
        <article class="enterprise-admin-card">
          <header><div><span>Modele economique</span><h3>Repartition 15 / 10 / 75</h3></div><small>${money(executive.grossVolume)} GMV</small></header>
          <div class="enterprise-admin-finance-split">
            <div><span>Plateforme</span><strong>15%</strong><em>${escape(money(executive.expectedPlatformRevenue))}</em></div>
            <div><span>Livreurs</span><strong>10%</strong><em>${escape(money(executive.expectedCourierPayout))}</em></div>
            <div><span>Vendeurs</span><strong>75%</strong><em>${escape(money(executive.expectedSellerPayout))}</em></div>
          </div>
        </article>
      </section>`;
  }

  function panelSecurity(data) {
    return `
      <section class="enterprise-admin-panel" data-enterprise-panel="security">
        <div class="enterprise-admin-grid two">
          <article class="enterprise-admin-card">
            <header><div><span>Session privilegiee</span><h3>Identite administrateur</h3></div><span class="enterprise-admin-pill active">Active</span></header>
            <dl class="enterprise-admin-definition-list">
              <div><dt>Compte</dt><dd>${escape(data.viewer.name || data.viewer.email)}</dd></div>
              <div><dt>Role</dt><dd>${data.viewer.isSuperAdmin ? 'Super administrateur' : 'Administrateur delegue'}</dd></div>
              <div><dt>Tenant</dt><dd>${escape(data.tenantId)}</dd></div>
              <div><dt>Permissions</dt><dd>${escape(data.viewer.permissions.join(', ') || 'Aucune')}</dd></div>
            </dl>
          </article>
          <article class="enterprise-admin-card">
            <header><div><span>Infrastructure</span><h3>Contexte de confiance</h3></div><span class="enterprise-admin-pill active">Backend</span></header>
            <dl class="enterprise-admin-definition-list">
              <div><dt>Projet</dt><dd>${escape(data.security.projectId || 'sokiva-dev')}</dd></div>
              <div><dt>Region</dt><dd>${escape(data.security.region)}</dd></div>
              <div><dt>Source</dt><dd>${escape(data.security.trustedSource)}</dd></div>
              <div><dt>Lectures sensibles</dt><dd>${data.security.directSensitiveReadsDisabled ? 'Bloquees cote navigateur' : 'A verifier'}</dd></div>
            </dl>
          </article>
        </div>
      </section>`;
  }

  function decisionDialog() {
    return `
      <dialog class="enterprise-admin-dialog" id="enterprise-admin-decision-dialog">
        <form method="dialog" id="enterprise-admin-decision-form">
          <header><div><span>Decision administrative</span><h3 id="enterprise-admin-decision-title">Confirmer</h3></div><button type="button" class="enterprise-admin-dialog-close" data-dialog-close aria-label="Fermer">${icon('x')}</button></header>
          <p id="enterprise-admin-decision-copy"></p>
          <label class="enterprise-admin-reason" id="enterprise-admin-reason-field"><span>Motif obligatoire</span><textarea id="enterprise-admin-decision-reason" rows="4" maxlength="300"></textarea></label>
          <footer><button type="button" class="btn-link" data-dialog-close>Annuler</button><button type="submit" class="btn-primary" id="enterprise-admin-decision-submit">Confirmer</button></footer>
        </form>
      </dialog>`;
  }

  function renderDashboard(data) {
    state.data = data;
    const target = root();
    if (!target) return;
    const executive = data.executive;
    target.innerHTML = `
      <div class="enterprise-admin-shell">
        <header class="enterprise-admin-header">
          <div>
            <span class="enterprise-admin-eyebrow">SOKIVA ENTERPRISE OPERATIONS</span>
            <h2>Centre de commandement</h2>
            <p>Pilotage securise des acces, commandes, marketplace, finances et risques.</p>
          </div>
          <div class="enterprise-admin-header-actions">
            <span class="enterprise-admin-live">${icon('radio')} Backend securise</span>
            <button class="btn-ghost-dark" id="enterprise-admin-refresh" type="button">${icon('refresh-cw')} Actualiser</button>
          </div>
        </header>
        <div class="enterprise-admin-meta">
          <span>${icon('user-cog')} ${escape(data.viewer.name || data.viewer.email)}</span>
          <span>${icon('building-2')} ${escape(data.tenantId)}</span>
          <span>${icon('clock-3')} Donnees du ${escape(dateTime(data.generatedAt))}</span>
        </div>
        <div class="enterprise-admin-kpi-grid">
          ${kpi('circle-dollar-sign', money(executive.grossVolume), 'GMV', `${executive.orderCount} commande(s)`)}
          ${kpi('receipt-text', executive.activeOrders, 'Commandes actives', `${executive.rolling24hOrders} sur 24 h`, executive.activeOrders ? 'warning' : '')}
          ${kpi('package-check', executive.deliveredOrders, 'Livraisons terminees', `${percent(1 - executive.cancellationRate)} hors annulation`, 'success')}
          ${kpi('wallet-cards', money(executive.averageBasket), 'Panier moyen', `${executive.paidOrders} paiement(s) confirme(s)`)}
          ${kpi('badge-check', data.access.pendingCount, 'Candidatures', `${data.access.claimsFailureCount} anomalie(s) IAM`, data.access.pendingCount ? 'warning' : '')}
          ${kpi('store', data.marketplace.activeSellerCount, 'Vendeurs actifs', `${data.marketplace.pendingProductCount} produit(s) a verifier`)}
          ${kpi('truck', data.marketplace.activeCourierCount, 'Livreurs actifs', `${data.marketplace.lowStockCount} alerte(s) stock`)}
          ${kpi('landmark', money(executive.recognizedPlatformRevenue), 'Revenu reconnu', `${money(executive.expectedPlatformRevenue)} attendu`, 'success')}
        </div>
        <div class="enterprise-admin-layout">
          <nav class="enterprise-admin-nav" aria-label="Modules du centre de commandement">
            <button class="active" type="button" data-enterprise-tab="overview">${icon('layout-dashboard')}<span>Vue executive</span></button>
            <button type="button" data-enterprise-tab="access">${icon('users-round')}<span>Acces et identites</span><em>${data.access.pendingCount}</em></button>
            <button type="button" data-enterprise-tab="orders">${icon('package-search')}<span>Commandes</span><em>${executive.activeOrders}</em></button>
            <button type="button" data-enterprise-tab="marketplace">${icon('store')}<span>Marketplace</span><em>${data.marketplace.pendingProductCount}</em></button>
            <button type="button" data-enterprise-tab="finance">${icon('chart-no-axes-combined')}<span>Finance</span></button>
            <button type="button" data-enterprise-tab="security">${icon('shield-check')}<span>Securite et IAM</span></button>
          </nav>
          <main class="enterprise-admin-workspace">
            ${panelOverview(data)}
            ${panelAccess(data)}
            ${panelOrders(data)}
            ${panelMarketplace(data)}
            ${panelFinance(data)}
            ${panelSecurity(data)}
          </main>
        </div>
        ${decisionDialog()}
      </div>`;
    bindEvents(target);
    setActiveTab(state.activeTab);
    refreshIcons(target);
  }

  function setActiveTab(tabName) {
    state.activeTab = tabName;
    const target = root();
    if (!target) return;
    target.querySelectorAll('[data-enterprise-tab]').forEach(button => button.classList.toggle('active', button.dataset.enterpriseTab === tabName));
    target.querySelectorAll('[data-enterprise-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.enterprisePanel === tabName));
  }

  function openDecision(type, requestId, roleType = '') {
    const dialog = document.getElementById('enterprise-admin-decision-dialog');
    const title = document.getElementById('enterprise-admin-decision-title');
    const copy = document.getElementById('enterprise-admin-decision-copy');
    const reasonField = document.getElementById('enterprise-admin-reason-field');
    const reason = document.getElementById('enterprise-admin-decision-reason');
    const submit = document.getElementById('enterprise-admin-decision-submit');
    const record = state.data?.access?.recentRequests?.find(item => item.id === requestId);
    if (!dialog || !record) return;
    state.decision = { type, requestId, roleType };
    const isReject = type === 'reject';
    title.textContent = isReject ? 'Rejeter la candidature' : 'Approuver la candidature';
    copy.textContent = isReject
      ? `Le refus de ${record.businessName || record.name || 'cette candidature'} sera journalise.`
      : `Le compte existant recevra le role ${roleType}. Les claims Firebase seront synchronises par le backend.`;
    reasonField.hidden = !isReject;
    reason.required = isReject;
    reason.value = '';
    submit.textContent = isReject ? 'Confirmer le refus' : 'Confirmer l approbation';
    dialog.showModal();
  }

  function closeDecision() {
    document.getElementById('enterprise-admin-decision-dialog')?.close();
    state.decision = null;
  }

  async function submitDecision(event) {
    event.preventDefault();
    const decision = state.decision;
    if (!decision) return;
    const submit = document.getElementById('enterprise-admin-decision-submit');
    const reason = document.getElementById('enterprise-admin-decision-reason')?.value.trim() || '';
    submit.disabled = true;
    try {
      if (decision.type === 'approve') {
        await callable('approveRoleRequestEnterprise')({ tenantId: TENANT_ID, requestId: decision.requestId, role: decision.roleType });
        notify('Candidature approuvee et droits synchronises.', 'success', 'badge-check');
      } else {
        await callable('rejectRoleRequest')({ tenantId: TENANT_ID, requestId: decision.requestId, reason });
        notify('Candidature refusee et decision auditee.', 'success', 'shield-x');
      }
      closeDecision();
      await loadDashboard();
    } catch (error) {
      submit.disabled = false;
      notify(messageFrom(error, 'La decision n a pas pu etre enregistree.'), 'error', 'alert-circle');
    }
  }

  function bindEvents(target) {
    target.querySelector('#enterprise-admin-refresh')?.addEventListener('click', loadDashboard);
    target.querySelectorAll('[data-enterprise-tab]').forEach(button => button.addEventListener('click', () => setActiveTab(button.dataset.enterpriseTab)));
    target.querySelectorAll('[data-enterprise-tab-target]').forEach(button => button.addEventListener('click', () => setActiveTab(button.dataset.enterpriseTabTarget)));
    target.querySelectorAll('[data-role-approve]').forEach(button => button.addEventListener('click', () => openDecision('approve', button.dataset.roleApprove, button.dataset.roleType)));
    target.querySelectorAll('[data-role-reject]').forEach(button => button.addEventListener('click', () => openDecision('reject', button.dataset.roleReject)));
    target.querySelectorAll('[data-dialog-close]').forEach(button => button.addEventListener('click', closeDecision));
    target.querySelector('#enterprise-admin-decision-form')?.addEventListener('submit', submitDecision);
  }

  async function currentUser() {
    const auth = backend()?.auth;
    if (!auth) throw new Error('Firebase Authentication est indisponible.');
    if (auth.currentUser) return auth.currentUser;
    return new Promise(resolve => {
      const unsubscribe = auth.onAuthStateChanged(user => {
        unsubscribe();
        resolve(user);
      });
    });
  }

  async function loadDashboard() {
    if (state.loading) return;
    state.loading = true;
    renderLoading();
    try {
      const user = await currentUser();
      if (!user) {
        window.location.assign(`login.html?next=${encodeURIComponent('admin.html')}`);
        return;
      }
      await user.getIdToken(true);
      const response = await callable('getAdminCommandCenter')({ tenantId: TENANT_ID, limit: 250 });
      renderDashboard(response.data);
    } catch (error) {
      renderError(error);
    } finally {
      state.loading = false;
    }
  }

  document.addEventListener('DOMContentLoaded', loadDashboard);
})();
