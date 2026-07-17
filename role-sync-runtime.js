/* Admin recovery UI for approved roles with failed Auth claims synchronization. */
'use strict';

(function roleClaimsRecoveryRuntime() {
  if (!window.MarketplaceData || typeof window.MarketplacePages === 'undefined') return;

  MarketplaceData.resyncRoleClaims = async function resyncRoleClaims(requestId) {
    const functions = window.AfroMarketFirebase?.functions;
    if (!functions) throw new Error('Le service sécurisé est indisponible.');
    try {
      const response = await functions.httpsCallable('resyncRoleClaims')({
        tenantId: 'lamylenoise',
        requestId
      });
      return response.data;
    } catch (error) {
      const raw = error?.details?.message || error?.message || 'Synchronisation Auth impossible.';
      throw new Error(String(raw).replace(/^FirebaseError:\s*/i, ''));
    }
  };

  MarketplacePages.requestRow = function secureRequestRow(request) {
    const role = request.type === 'courier' ? 'courier' : 'seller';
    const status = request.status || 'pending';
    const pending = status === 'pending';
    const needsSync = status === 'approved' && ['failed', 'pending'].includes(request.claimsSyncStatus);
    return `
      <article class="admin-record">
        <div>
          <strong>${this.escape(request.businessName || request.name || 'Candidature')}</strong>
          <p>${this.escape(role)} · ${this.escape(request.email || '')} · ${this.escape(request.phone || '')}</p>
          <small>${this.escape(request.city || '')}${request.claimsSyncStatus ? ` · Auth: ${this.escape(request.claimsSyncStatus)}` : ''}</small>
        </div>
        <span class="status-pill ${status}">${this.statusText(status)}</span>
        <div class="record-actions">
          ${pending ? `<button class="btn-link" data-approve="${this.escape(request.id)}" data-type="${role}">Approuver</button>` : ''}
          ${pending ? `<button class="btn-link danger" data-reject="${this.escape(request.id)}">Rejeter</button>` : ''}
          ${needsSync ? `<button class="btn-link" data-resync-claims="${this.escape(request.id)}">Réparer Auth</button>` : ''}
        </div>
      </article>`;
  };

  const renderAdmin = MarketplacePages.renderAdmin.bind(MarketplacePages);
  MarketplacePages.renderAdmin = async function renderAdminWithClaimsRecovery(root) {
    await renderAdmin(root);
    root.querySelectorAll('[data-resync-claims]').forEach(button => {
      button.addEventListener('click', async () => {
        button.disabled = true;
        try {
          await MarketplaceData.resyncRoleClaims(button.dataset.resyncClaims);
          Toast.show('Rôle Firebase Auth resynchronisé', 'success', 'badge-check');
          await this.renderAdmin(root);
        } catch (error) {
          button.disabled = false;
          Toast.show(error.message, 'error', 'alert-circle');
        }
      });
    });
  };
})();
