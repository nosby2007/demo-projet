/* Enterprise IAM recovery module for SOKIVA administrators. */
'use strict';

(function enterpriseAccessRecoveryRuntime() {
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

  async function loadRecovery(card) {
    if (loading) return;
    loading = true;
    const status = card.querySelector('[data-iam-recovery-status]');
    const list = card.querySelector('[data-iam-recovery-list]');
    const refresh = card.querySelector('[data-iam-recovery-refresh]');
    refresh.disabled = true;
    status.textContent = 'Verification des claims Firebase...';
    list.replaceChildren();
    try {
      const response = await callable('getAdminCommandCenter')({ tenantId: TENANT_ID, limit: 250 });
      const requests = Array.isArray(response.data?.access?.recentRequests) ? response.data.access.recentRequests : [];
      const recoverable = requests.filter(request => request.status === 'approved' && ['pending', 'failed'].includes(request.claimsSyncStatus));
      status.textContent = `${recoverable.length} compte(s) a reparer`;
      if (!recoverable.length) {
        const empty = element('div', 'enterprise-admin-health-ok');
        empty.append(icon('badge-check'), element('span', '', 'Tous les roles approuves sont synchronises avec Firebase Auth.'));
        list.append(empty);
      } else {
        recoverable.forEach(request => {
          const row = element('article', 'enterprise-admin-record');
          const main = element('div', 'enterprise-admin-record-main');
          main.append(
            element('strong', '', request.businessName || request.name || request.id),
            element('p', '', `${request.type} · Auth ${request.claimsSyncStatus}`),
            element('small', '', request.claimsSyncError || 'Synchronisation en attente')
          );
          const action = element('button', 'btn-link', 'Reparer Auth');
          action.type = 'button';
          action.dataset.resyncClaims = request.id;
          action.addEventListener('click', async () => {
            action.disabled = true;
            try {
              await callable('resyncRoleClaimsEnterprise')({ tenantId: TENANT_ID, requestId: request.id });
              if (window.Toast?.show) window.Toast.show('Claims Firebase Auth resynchronises.', 'success', 'badge-check');
              setTimeout(() => loadRecovery(card), 0);
            } catch (error) {
              action.disabled = false;
              if (window.Toast?.show) window.Toast.show(messageFrom(error, 'Synchronisation Auth impossible.'), 'error', 'alert-circle');
            }
          });
          row.append(main, action);
          list.append(row);
        });
      }
      refreshIcons(card);
    } catch (error) {
      status.textContent = messageFrom(error, 'Impossible de verifier les claims Firebase.');
      if (window.Toast?.show) window.Toast.show(status.textContent, 'error', 'alert-circle');
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  }

  function enhance() {
    const root = document.getElementById(ROOT_ID);
    const panel = root?.querySelector('[data-enterprise-panel="access"]');
    if (!panel || panel.querySelector('[data-iam-recovery-card]')) return;

    const card = element('article', 'enterprise-admin-card');
    card.dataset.iamRecoveryCard = 'true';
    const header = document.createElement('header');
    const heading = document.createElement('div');
    heading.append(element('span', '', 'Continuite IAM'), element('h3', '', 'Reparation des claims Firebase'));
    const status = element('small', '', 'Verification a la demande');
    status.dataset.iamRecoveryStatus = 'true';
    header.append(heading, status);

    const refresh = element('button', 'btn-link', 'Verifier les claims');
    refresh.type = 'button';
    refresh.dataset.iamRecoveryRefresh = 'true';
    const list = element('div', 'enterprise-admin-list');
    list.dataset.iamRecoveryList = 'true';
    const intro = element('p', 'muted', 'Relancez la synchronisation uniquement lorsqu une candidature approuvee signale une anomalie Auth.');
    card.append(header, intro, refresh, list);
    panel.append(card);
    refresh.addEventListener('click', () => loadRecovery(card));
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById(ROOT_ID);
    if (!root) return;
    const observer = new MutationObserver(enhance);
    observer.observe(root, { childList: true, subtree: true });
    enhance();
  });
})();
