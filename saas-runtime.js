/* Trusted SaaS runtime: moves sensitive marketplace actions out of the browser. */
'use strict';

(function secureMarketplaceRuntime() {
  if (!window.MarketplaceData) {
    console.error('MarketplaceData must load before saas-runtime.js');
    return;
  }

  const original = {
    list: MarketplaceData.list.bind(MarketplaceData),
    update: MarketplaceData.update.bind(MarketplaceData),
    saveProduct: MarketplaceData.saveProduct.bind(MarketplaceData),
    submitRoleRequest: MarketplaceData.submitRoleRequest.bind(MarketplaceData)
  };

  function callable(name) {
    const functions = window.AfroMarketFirebase?.functions;
    if (!functions) {
      throw new Error('Le service sécurisé est indisponible. Rechargez la page ou contactez le support.');
    }
    return functions.httpsCallable(name);
  }

  function messageFrom(error, fallback) {
    const raw = error?.details?.message || error?.message || fallback;
    return String(raw).replace(/^FirebaseError:\s*/i, '');
  }

  function productId(item) {
    const raw = String(item?.productId || item?.id || '').trim();
    return /^\d+$/.test(raw) ? `catalog-${raw}` : raw;
  }

  function normalizeRoleRecord(record) {
    if (record?.sellerPayout != null && !record.payout) {
      return { ...record, payout: { seller: Number(record.sellerPayout || 0) } };
    }
    if (record?.courierPayout != null && !record.payout) {
      return { ...record, payout: { courier: Number(record.courierPayout || 0) } };
    }
    return record;
  }

  MarketplaceData.submitRoleRequest = async function submitEmploymentApplication(data) {
    const user = await MarketplaceData.currentUser();
    if (!user) {
      throw new Error('Créez un compte client ou connectez-vous avant d’envoyer votre candidature.');
    }
    return original.submitRoleRequest({
      ...data,
      tenantId: 'lamylenoise',
      requesterUid: user.uid
    });
  };

  MarketplaceData.createOrder = async function createSecureOrder(order) {
    try {
      const response = await callable('createOrderDraft')({
        tenantId: order.tenantId || 'lamylenoise',
        customerName: order.customerName,
        email: order.email,
        phone: order.phone,
        emirate: order.emirate,
        address: order.address,
        deliveryDate: order.deliveryDate,
        deliverySlot: order.deliverySlot,
        paymentMethod: order.paymentMethod,
        items: (order.items || []).map(item => ({
          productId: productId(item),
          quantity: Number(item.qty || item.quantity || 1)
        }))
      });
      return response.data.orderId;
    } catch (error) {
      throw new Error(messageFrom(error, 'La commande sécurisée n’a pas pu être créée.'));
    }
  };

  MarketplaceData.list = async function listSecure(path, localKey) {
    if (path !== 'orders') return original.list(path, localKey);
    try {
      const response = await callable('listOrdersForRole')({ tenantId: 'lamylenoise' });
      const orders = Array.isArray(response.data?.orders) ? response.data.orders : [];
      return orders.map(normalizeRoleRecord);
    } catch (error) {
      throw new Error(messageFrom(error, 'Impossible de charger les commandes autorisées.'));
    }
  };

  MarketplaceData.update = async function updateSecure(path, id, data) {
    if (path === 'orders') {
      try {
        const isCourierClaim = data?.status === 'in_transit' && Boolean(data?.courierUid);
        const response = isCourierClaim
          ? await callable('claimDeliveryJob')({ orderId: id })
          : await callable('transitionOrder')({ orderId: id, status: data?.status });
        return response.data;
      } catch (error) {
        throw new Error(messageFrom(error, 'Le statut de la commande n’a pas été modifié.'));
      }
    }

    if (path === 'roleRequests' && data?.status === 'approved') {
      try {
        const response = await callable('approveRoleRequest')({
          requestId: id,
          role: data.assignedRole
        });
        return response.data;
      } catch (error) {
        throw new Error(messageFrom(error, 'La candidature n’a pas pu être approuvée.'));
      }
    }

    return original.update(path, id, data);
  };

  MarketplaceData.saveProduct = async function submitProductForReview(product) {
    try {
      const response = await callable('submitProduct')({
        tenantId: product.tenantId || 'lamylenoise',
        name: product.name,
        brand: product.brand,
        price: Number(product.price),
        category: product.category,
        image: product.image,
        delivery: product.delivery
      });
      return response.data;
    } catch (error) {
      throw new Error(messageFrom(error, 'Le produit n’a pas pu être soumis.'));
    }
  };

  if (typeof Toast !== 'undefined' && typeof Toast.show === 'function') {
    const showToast = Toast.show.bind(Toast);
    Toast.show = function secureMessage(message, ...args) {
      const replacements = {
        'Produit publie dans la boutique': 'Produit soumis pour validation par l’administrateur',
        'Statut approuve et identifiants generes': 'Candidature approuvée et compte existant activé'
      };
      return showToast(replacements[message] || message, ...args);
    };
  }

  window.LamylenoiseSaaS = Object.freeze({
    mode: 'trusted-backend',
    tenantId: 'lamylenoise',
    region: 'me-central1'
  });
})();
