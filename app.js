/* SOKIVA storefront bootstrap.
 * Loads the original ecommerce application unchanged, with the public brand runtime first.
 */
'use strict';

(function loadSokivaStorefront() {
  if (document.readyState !== 'loading') {
    console.error('[SOKIVA] app.js must be loaded as a normal script before DOMContentLoaded.');
    return;
  }

  document.write('<script src="brand-runtime.js"><\/script>');
  document.write('<script src="app-core.js"><\/script>');
})();
