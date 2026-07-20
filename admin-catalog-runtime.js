/* SOKIVA admin catalogue publication workflow. */
'use strict';

(function sokivaAdminCatalogRuntime() {
  if (window.SokivaAdminCatalogRuntime) return;

  const TENANT_ID = 'lamylenoise';
  const ROOT_ID = 'enterprise-admin-root';

  function backend() {
    return window.SokivaFirebase || window.AfroMarketFirebase || null;
  }

  function callable(name) {
    const functions = backend()?.functions;
    if (!functions) throw new Error('Le service Firebase Functions est indisponible.');
    return functions.httpsCallable(name);
  }

  function messageFrom(error, fallback) {
    const raw = error?.