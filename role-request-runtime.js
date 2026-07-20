/* Secure vendor/courier application submission and tracking for candidates. */
'use strict';

(function roleRequestEnterpriseRuntime() {
  if (!window.MarketplaceData || typeof window.MarketplacePages === 'undefined') return;

  const STATUS_LABEL = {
    pending: 'En attente',
    submitted: 'Candidature soumise',
    under_review: 'En cours de vérification',
    needs_changes: 'Corrections attendues',
    approved: 'Approuvée',
    rejected: 'Refusée'
  };

  function backend() {
    return window.SokivaFirebase || window.AfroMarketFirebase || null;
  }

  function callable(name) {
    const functions = backend()?.functions;
    if (!functions) throw new Error('Le service sécurisé est indisponible.');
    return functions.httpsCallable(name);
  }

  function messageFrom(error, fallback) {
    const raw = error?.details?.message || error?.message || fallback;
    return String(raw || fallback).replace(/^FirebaseError:\s*/i, '');
  }

  MarketplaceData.submitRoleRequest = async function submitRoleRequest(data) {
    try {
      const response = await callable('submitRoleRequestEnterprise')({
        tenantId: backend()?.tenantId || 'lamylenoise',
        type: data.type,
        name: data.name,
        phone: data.phone,
        city: data.city,
        businessName: data.businessName,
        vehicle: data.vehicle,
        message: data.message
      });
      return response.data;
    } catch (error) {
      throw new Error(messageFrom(error, 'Candidature non envoyée.'));
    }
  };

  function requestCard(request) {
    const label = STATUS_LABEL[request.status] || request.status;
    const reason = request.status === 'needs_changes' ? request.changesRequestedReason
      : request.status === 'rejected' ? request.rejectionReason
      : '';
    return `
      <article class="role-request-card">
        <div class="role-request-card-head">
          <strong>${MarketplacePages.escape(request.businessName || (request.type === 'courier' ? 'Livreur' : 'Vendeur'))}</strong>
          <span class="status-pill ${MarketplacePages.escape(request.status)}">${MarketplacePages.escape(label)}</span>
        </div>
        <p>${MarketplacePages.escape(request.type === 'courier' ? 'Livreur' : 'Vendeur')} · ${MarketplacePages.escape(request.city || 'Ville non renseignée')}</p>
        ${reason ? `<p class="role-request-reason">${MarketplacePages.escape(reason)}</p>` : ''}
        <small>Mis à jour ${MarketplacePages.formatDate(request.updatedAt)}</small>
      </article>`;
  }

  async function loadMyRequests(container) {
    if (!container) return;
    container.innerHTML = '<p class="muted">Chargement du suivi...</p>';
    try {
      const response = await callable('getMyRoleRequestsEnterprise')({});
      const requests = response.data?.requests || [];
      container.innerHTML = requests.length
        ? requests.map(requestCard).join('')
        : '<p class="muted">Aucune candidature envoyée pour le moment.</p>';
      if (typeof lucide !== 'undefined') lucide.createIcons({ nodes: [container] });
    } catch (error) {
      container.innerHTML = `<p class="muted">${MarketplacePages.escape(messageFrom(error, 'Suivi indisponible.'))}</p>`;
    }
  }

  MarketplacePages.initRoleRequest = function initRoleRequestSecure() {
    const form = document.getElementById('role-request-form');
    const tracking = document.getElementById('role-request-tracking');
    if (!form) return;

    form.addEventListener('submit', async event => {
      event.preventDefault();
      const submitButton = form.querySelector('button[type="submit"]');
      const data = this.formData(form);
      if (submitButton) submitButton.disabled = true;
      try {
        const result = await MarketplaceData.submitRoleRequest(data);
        Toast.show(
          result?.resubmitted ? 'Candidature renvoyée pour vérification.' : 'Candidature envoyée, suivez son évolution ci-dessous.',
          'success', 'send', 5000
        );
        form.reset();
        await loadMyRequests(tracking);
      } catch (error) {
        Toast.show(error.message || 'Candidature non envoyée', 'error', 'alert-circle');
      } finally {
        if (submitButton) submitButton.disabled = false;
      }
    });

    const auth = backend()?.auth;
    if (auth) {
      auth.onAuthStateChanged(user => {
        if (user) loadMyRequests(tracking);
        else if (tracking) tracking.innerHTML = '<p class="muted">Connectez-vous pour suivre votre candidature.</p>';
      });
    }
  };
})();
