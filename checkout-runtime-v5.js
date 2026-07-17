/* Idempotent checkout client for retry-safe COD orders. */
'use strict';

(function idempotentCheckoutRuntime() {
  if (!window.MarketplaceData || !window.AfroMarketFirebase?.functions) {
    console.warn('Trusted marketplace runtime must load before checkout-runtime-v5.js');
    return;
  }

  function productId(item) {
    const raw = String(item?.productId || item?.id || '').trim();
    return /^\d+$/.test(raw) ? `catalog-${raw}` : raw;
  }

  function fingerprint(order) {
    const normalized = {
      items: (order.items || []).map(item => ({
        productId: productId(item),
        quantity: Number(item.qty || item.quantity || 1)
      })).sort((a, b) => a.productId.localeCompare(b.productId)),
      emirate: order.emirate || '',
      address: order.address || '',
      deliveryDate: order.deliveryDate || '',
      deliverySlot: order.deliverySlot || '',
      paymentMethod: order.paymentMethod || 'cod'
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
    const storageKey = `lamylenoise-checkout:${fingerprint(order)}`;
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

  MarketplaceData.createOrder = async function createIdempotentOrder(order) {
    const button = document.querySelector('#checkout-form button[type="submit"]');
    const previousHtml = button?.innerHTML;
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.textContent = 'Commande en cours…';
    }

    const attempt = checkoutKey(order);
    try {
      const callable = window.AfroMarketFirebase.functions.httpsCallable('createOrderDraft');
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
