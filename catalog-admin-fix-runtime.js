/* SOKIVA admin catalogue publication guard and immediate preview. */
'use strict';

(function sokivaCatalogAdminFixRuntime() {
  if (window.SokivaCatalogAdminFixRuntime) return;

  const TENANT_ID = 'lamylenoise';
  const FORM_ID = 'enterprise-admin-product-form';
  const PREVIEW_ID = 'enterprise-admin-product-preview';

  function backend() {
    return window.S