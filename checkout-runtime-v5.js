/* Idempotent checkout client for retry-safe COD orders. */
'use strict';

(function idempotentCheckoutRuntime() {
  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  if (!window.MarketplaceData || !backend?.functions) {
    console.warn('Trusted marketplace runtime must load before checkout-runtime-v5.js');
    return;
  }

  function productId(item) {
    const raw = String(item?.productId || item?.id || '').trim();
    return /^\d+$/.test(raw) ? `catalog-${raw}` : raw;
  }

  function deliveryLocation() {
    return window.SokivaDeliveryLocation?.get?.() || null;
  }

  function fingerprint(order) {
    const location = deliveryLocation();
    const normalized = {
      items: (order.items || []).map(item => ({
        productId: productId(item),
        quantity: Number(item.qty || item.quantity || 1)
      })).sort((a, b) => a.productId.localeCompare(b.productId)),
      emirate: order.emirate || '',
      address: order.address || '',
      deliveryDate: order.deliveryDate || '',
      deliverySlot: order.deliverySlot || '',
      paymentMethod: order.paymentMethod || 'cod',
      destination: location ? [location.latitude, location.longitude] : null
    };
    const source = JSON.stringify(normalized);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index += 1) {
      hash ^= source.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function checkoutKey(order) {
    const storageKey = `sokiva-checkout:${fingerprint(order)}`;
    let key = sessionStorage.getItem(storageKey);
    if (!key) {
      key = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(storageKey, key);
    }
    return { key, storageKey };
  }

  function errorMessage(error) {
    const raw = error?.details?.message || error?.message || 'La commande sécurisée n’a pas pu être créée.';
    return String(raw).replace(/^FirebaseError:\s*/i, '');
  }

  async function attachDestination(orderId, location) {
    if (!location) return;
    try {
      await backend.functions.httpsCallable('setDeliveryDestination')({
        tenantId: 'lamylenoise',
        orderId,
        source: location.source || 'customer_map',
        capturedAt: location.capturedAt || Date.now(),
        location
      });
      sessionStorage.removeItem(`delivery-location-pending:${orderId}`);
    } catch (error) {
      sessionStorage.setItem(`delivery-location-pending:${orderId}`, JSON.stringify(location));
      console.warn('Order created but delivery location must be confirmed from the customer dashboard.', error);
    }
  }

  MarketplaceData.createOrder = async function createIdempotentOrder(order) {
    const button = document.querySelector('#checkout-form button[type="submit"]');
    const previousHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Commande en cours…';
    }

    const attempt = checkoutKey(order);
    const location = deliveryLocation();
    try {
      const callable = backend.functions.httpsCallable('createOrderDraft');
      const response = await callable({
        tenantId: order.tenantId || 'lamylenoise',
        idempotencyKey: attempt.key,
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        emirate: order.emirate,
        address: order.address,
        deliveryDate: order.deliveryDate,
        deliverySlot: order.deliverySlot,
        paymentMethod: order.paymentMethod || 'cod',
        items: (order.items || []).map(item => ({
          productId: productId(item),
          quantity: Number(item.qty || item.quantity || 1)
        }))
      });
      const result = response.data || {};
      if (result.deliveryCode) {
        sessionStorage.setItem(`delivery-code:${result.orderId}`, result.deliveryCode);
      }
      await attachDestination(result.orderId, location);
      sessionStorage.removeItem(attempt.storageKey);
      return result.orderId;
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = previousHtml || 'Confirmer la commande sécurisée';
      }
      throw new Error(errorMessage(error));
    }
  };
})();
