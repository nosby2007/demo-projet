/* Stripe Elements card payment for checkout-runtime-v5.js orders. */
'use strict';

(function stripeCardCheckoutRuntime() {
  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  if (!window.MarketplaceData || !backend?.functions) {
    console.warn('Trusted marketplace runtime must load before checkout-card-runtime.js');
    return;
  }
  if (typeof Stripe !== 'function' || !window.STRIPE_PUBLISHABLE_KEY) {
    console.warn('Stripe.js and stripe-config.js must load before checkout-card-runtime.js');
    return;
  }

  const stripe = Stripe(window.STRIPE_PUBLISHABLE_KEY);
  const elements = stripe.elements();
  const cardElement = elements.create('card');

  const panel = document.getElementById('card-payment-panel');
  const errorEl = document.getElementById('card-errors');
  let mounted = false;

  function mountCardElement() {
    if (mounted || !panel) return;
    cardElement.mount('#card-element');
    cardElement.on('change', event => {
      if (errorEl) errorEl.textContent = event.error ? event.error.message : '';
    });
    mounted = true;
  }

  function updatePanelVisibility() {
    if (!panel) return;
    const selected = document.querySelector('#checkout-form input[name="pay"]:checked')?.value;
    panel.hidden = selected !== 'card';
    if (selected === 'card') mountCardElement();
  }

  document.querySelectorAll('#checkout-form input[name="pay"]').forEach(input => {
    input.addEventListener('change', updatePanelVisibility);
  });
  updatePanelVisibility();

  function resetSubmitButton() {
    const button = document.querySelector('#checkout-form button[type="submit"]');
    if (!button) return;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.innerHTML = '<i data-lucide="shield-check"></i> Confirmer la commande sécurisée';
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  const originalCreateOrder = MarketplaceData.createOrder;
  MarketplaceData.createOrder = async function createOrderWithCardPayment(order) {
    const orderId = await originalCreateOrder(order);
    if (order.paymentMethod !== 'card') return orderId;

    const draft = MarketplaceData.lastOrderResult || {};
    if (draft.orderId !== orderId || draft.paymentStatus !== 'pending_card') return orderId;

    if (errorEl) errorEl.textContent = '';
    try {
      const intentResponse = await backend.functions.httpsCallable('createPaymentIntent')({ orderId });
      const clientSecret = intentResponse.data?.clientSecret;
      if (!clientSecret) throw new Error('Le paiement par carte n’a pas pu être initialisé.');

      const confirmation = await stripe.confirmCardPayment(clientSecret, {
        payment_method: { card: cardElement }
      });
      if (confirmation.error) {
        throw new Error(confirmation.error.message || 'Le paiement par carte a été refusé.');
      }
      return orderId;
    } catch (error) {
      if (errorEl) errorEl.textContent = error.message;
      resetSubmitButton();
      throw error;
    }
  };
})();
