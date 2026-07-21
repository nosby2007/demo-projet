/* SOKIVA live order tracking: private realtime map and courier GPS sharing. */
'use strict';

(function liveTrackingRuntime() {
  if (!window.MarketplaceData || typeof window.MarketplacePages === 'undefined') return;
  const backend = window.SokivaFirebase || window.AfroMarketFirebase;
  if (!backend?.db || !backend?.functions) return;

  const TENANT_ID = 'lamylenoise';
  const steps = [
    ['received', 'Commande reçue'],
    ['preparing', 'Préparation'],
    ['ready_for_pickup', 'Prête au retrait'],
    ['in_transit', 'En route'],
    ['delivered', 'Livrée']
  ];
  const statusRank = { received: 0, confirmed: 0, preparing: 1, ready_for_pickup: 2, in_transit: 3, delivered: 4 };
  const activeSubscriptions = new Map();
  const courierWatches = new Map();

  function callable(name) {
    return backend.functions.httpsCallable(name);
  }

  function stopSubscriptions() {
    activeSubscriptions.forEach(({ ref, handler }) => ref.off('value', handler));
    activeSubscriptions.clear();
  }

  function stopCourierWatch(orderId) {
    const watchId = courierWatches.get(orderId);
    if (watchId !== undefined && navigator.geolocation) navigator.geolocation.clearWatch(watchId);
    courierWatches.delete(orderId);
  }

  function reconcileCourierWatches(activeOrderIds) {
    courierWatches.forEach((watchId, orderId) => {
      if (!activeOrderIds.has(orderId)) stopCourierWatch(orderId);
    });
  }

  function formatTime(value) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'Asia/Dubai'
    }).format(new Date(Number(value)));
  }

  function create(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function renderSteps(container, tracking, order) {
    container.replaceChildren();
    const currentRank = statusRank[tracking?.status || order.status] ?? 0;
    const history = tracking?.statusHistory || {};
    steps.forEach(([key, label], index) => {
      const item = create('li', index < currentRank ? 'done' : index === currentRank ? 'active' : '');
      item.append(
        create('strong', '', label),
        create('small', '', formatTime(history[key] || (key === 'received' ? order.createdAt : null)))
      );
      container.append(item);
    });
    if ((tracking?.status || order.status) === 'cancelled') {
      container.replaceChildren(create('li', 'active', 'Commande annulée'));
    }
  }

  function mapController(element) {
    if (!window.L) return null;
    const map = window.L.map(element, { scrollWheelZoom: false }).setView([24.4539, 54.3773], 10);
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    let courierMarker = null;
    let destinationMarker = null;
    let line = null;
    return {
      update(tracking) {
        const courier = tracking?.courierLocation;
        const destination = tracking?.destination;
        const bounds = [];
        if (destination) {
          const point = [destination.latitude, destination.longitude];
          bounds.push(point);
          if (destinationMarker) destinationMarker.setLatLng(point);
          else destinationMarker = window.L.marker(point).addTo(map).bindPopup('Point de livraison');
        } else if (destinationMarker) {
          destinationMarker.remove();
          destinationMarker = null;
        }
        if (courier) {
          const point = [courier.latitude, courier.longitude];
          bounds.push(point);
          if (courierMarker) courierMarker.setLatLng(point);
          else courierMarker = window.L.circleMarker(point, {
            radius: 10, weight: 4, color: '#ffffff', fillColor: '#ff6b2b', fillOpacity: 1
          }).addTo(map).bindPopup('Livreur SOKIVA');
        } else if (courierMarker) {
          courierMarker.remove();
          courierMarker = null;
        }
        if (line) { line.remove(); line = null; }
        if (courier && destination) {
          line = window.L.polyline([
            [courier.latitude, courier.longitude],
            [destination.latitude, destination.longitude]
          ], { dashArray: '8 8', weight: 4 }).addTo(map);
        }
        if (bounds.length === 2) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
        else if (bounds.length === 1) map.setView(bounds[0], 15);
      }
    };
  }

  function subscribe(orderId, onValue) {
    const ref = backend.db.ref(`orderTracking/${orderId}`);
    const handler = snapshot => onValue(snapshot.val() || null);
    ref.on('value', handler, error => onValue({ error: error.message }));
    activeSubscriptions.set(orderId, { ref, handler });
  }

  function buildCustomerTracker(root, orders) {
    stopSubscriptions();
    const relevant = orders.filter(order => !['cancelled', 'refunded'].includes(order.status));
    if (!relevant.length) return;
    const selected = relevant.find(order => order.status === 'in_transit') || relevant[0];

    const panel = create('section', 'ops-panel tracking-panel');
    panel.dataset.liveTracking = 'true';
    const head = create('div', 'tracking-head');
    const heading = create('div');
    heading.append(create('h2', '', 'Suivi en temps réel'), create('p', 'tracking-muted', 'Carte privée, progression et estimation de distance.'));
    const select = create('select', 'tracking-select');
    relevant.forEach(order => {
      const option = create('option', '', `${order.id} · ${MarketplacePages.statusText(order.status)}`);
      option.value = order.id;
      option.selected = order.id === selected.id;
      select.append(option);
    });
    head.append(heading, select);

    const liveChip = create('span', 'tracking-live-chip offline', 'En attente du livreur');
    const partyLine = create('p', 'tracking-party');
    partyLine.hidden = true;
    const stepsList = create('ol', 'tracking-steps-live');
    const summary = create('div', 'tracking-summary');
    const etaBox = create('div'); etaBox.append(create('span', '', 'Arrivée estimée'), create('strong', '', '—'));
    const distanceBox = create('div'); distanceBox.append(create('span', '', 'Distance estimée'), create('strong', '', '—'));
    const updateBox = create('div'); updateBox.append(create('span', '', 'Dernière position'), create('strong', '', '—'));
    summary.append(etaBox, distanceBox, updateBox);
    const mapElement = create('div', 'tracking-map');
    const destinationButton = create('button', 'btn-link', 'Utiliser ma position comme point de livraison');
    destinationButton.type = 'button';
    const destinationStatus = create('p', 'tracking-muted', 'Le point est nécessaire pour afficher la distance et l’estimation.');
    panel.append(head, liveChip, partyLine, stepsList, summary, mapElement, destinationButton, destinationStatus);
    root.append(panel);

    let currentOrder = selected;
    const controller = mapController(mapElement);

    function watch(order) {
      stopSubscriptions();
      currentOrder = order;
      controller?.update(null);
      subscribe(order.id, tracking => {
        if (tracking?.error) {
          liveChip.textContent = 'Suivi indisponible';
          liveChip.className = 'tracking-live-chip offline';
          controller?.update(null);
          return;
        }
        renderSteps(stepsList, tracking, order);
        const parties = [];
        if (tracking?.sellerName) parties.push(`Préparé par ${tracking.sellerName}`);
        if (tracking?.courierName) parties.push(`Livreur : ${tracking.courierName}`);
        partyLine.textContent = parties.join(' · ');
        partyLine.hidden = !parties.length;
        const isLive = Boolean(tracking?.live && tracking?.courierLocation);
        liveChip.textContent = isLive ? 'Position du livreur en direct' : 'Progression synchronisée';
        liveChip.className = `tracking-live-chip${isLive ? '' : ' offline'}`;
        etaBox.querySelector('strong').textContent = tracking?.etaMinutes ? `≈ ${tracking.etaMinutes} min` : '—';
        distanceBox.querySelector('strong').textContent = tracking?.distanceRemainingKm != null ? `≈ ${tracking.distanceRemainingKm} km` : '—';
        updateBox.querySelector('strong').textContent = formatTime(tracking?.courierLocation?.publishedAt || tracking?.updatedAt);
        destinationButton.hidden = Boolean(tracking?.destination) || ['delivered', 'cancelled'].includes(tracking?.status || order.status);
        destinationStatus.hidden = destinationButton.hidden;
        controller?.update(tracking);
      });
    }

    select.addEventListener('change', () => {
      const order = relevant.find(item => item.id === select.value);
      if (order) watch(order);
    });

    destinationButton.addEventListener('click', () => {
      if (!navigator.geolocation) {
        destinationStatus.textContent = 'Géolocalisation indisponible sur cet appareil.';
        return;
      }
      destinationButton.disabled = true;
      destinationStatus.textContent = 'Recherche du point de livraison…';
      navigator.geolocation.getCurrentPosition(async position => {
        try {
          await callable('setDeliveryDestination')({
            tenantId: TENANT_ID,
            orderId: currentOrder.id,
            source: 'customer_gps',
            capturedAt: position.timestamp,
            location: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyMeters: position.coords.accuracy
            }
          });
          destinationStatus.textContent = 'Point de livraison confirmé.';
        } catch (error) {
          destinationStatus.textContent = String(error?.message || 'Point non enregistré.').replace(/^FirebaseError:\s*/i, '');
        } finally {
          destinationButton.disabled = false;
        }
      }, () => {
        destinationButton.disabled = false;
        destinationStatus.textContent = 'Autorisation refusée ou position indisponible.';
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
    });

    watch(selected);
  }

  async function publishLocation(orderId, position, statusElement) {
    try {
      const response = await callable('updateCourierLocation')({
        tenantId: TENANT_ID,
        orderId,
        capturedAt: position.timestamp,
        heading: position.coords.heading,
        speedMetersPerSecond: position.coords.speed,
        location: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy
        }
      });
      if (response.data?.accepted !== false) {
        statusElement.textContent = `Position partagée · précision ${Math.round(position.coords.accuracy)} m · ${formatTime(response.data?.publishedAt)}`;
      }
    } catch (error) {
      statusElement.textContent = String(error?.message || 'Position non publiée.').replace(/^FirebaseError:\s*/i, '');
    }
  }

  function appendCourierSharing(root, jobs, uid) {
    const active = jobs.filter(job => job.courierUid === uid && job.status === 'in_transit');
    const activeOrderIds = new Set(active.map(job => job.orderId || job.id));
    reconcileCourierWatches(activeOrderIds);
    if (!active.length) return;

    const section = create('section', 'ops-panel tracking-panel');
    section.dataset.courierTracking = 'true';
    section.append(create('h2', '', 'Partage GPS pendant la livraison'));
    section.append(create('p', 'tracking-muted', 'Le client voit uniquement votre position pendant la course. Le GPS est arrêté dès que la course quitte le statut En route.'));

    active.forEach(job => {
      const orderId = job.orderId || job.id;
      const sharing = courierWatches.has(orderId);
      const card = create('article', 'courier-share-card');
      const info = create('div');
      info.append(create('strong', '', orderId), create('p', 'tracking-muted', sharing ? 'Partage GPS actif' : 'Partage désactivé'));
      const actions = create('div', 'record-actions');
      const start = create('button', 'btn-primary', 'Démarrer le suivi');
      const stop = create('button', 'btn-link danger', 'Arrêter');
      start.disabled = sharing;
      stop.disabled = !sharing;
      actions.append(start, stop);
      card.append(info, actions);
      section.append(card);
      const status = info.querySelector('p');

      start.addEventListener('click', () => {
        if (!navigator.geolocation) {
          status.textContent = 'GPS indisponible sur cet appareil.';
          return;
        }
        if (courierWatches.has(orderId)) return;
        start.disabled = true;
        stop.disabled = false;
        status.textContent = 'Connexion au GPS…';
        const watchId = navigator.geolocation.watchPosition(
          position => publishLocation(orderId, position, status),
          error => {
            status.textContent = error.code === 1 ? 'Autorisation GPS refusée.' : 'Signal GPS indisponible.';
            if (error.code === 1) {
              stopCourierWatch(orderId);
              start.disabled = false;
              stop.disabled = true;
            }
          },
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
        );
        courierWatches.set(orderId, watchId);
      });

      stop.addEventListener('click', () => {
        stopCourierWatch(orderId);
        start.disabled = false;
        stop.disabled = true;
        status.textContent = 'Partage suspendu.';
      });
    });
    root.append(section);
  }

  async function recoverPendingDestinations(orders) {
    for (const order of orders) {
      const key = `delivery-location-pending:${order.id}`;
      const raw = sessionStorage.getItem(key);
      if (!raw) continue;
      let location;
      try { location = JSON.parse(raw); } catch { sessionStorage.removeItem(key); continue; }
      try {
        await callable('setDeliveryDestination')({
          tenantId: TENANT_ID,
          orderId: order.id,
          source: location.source || 'customer_map',
          capturedAt: location.capturedAt || Date.now(),
          location
        });
        sessionStorage.removeItem(key);
        if (window.Toast?.show) Toast.show('Point de livraison confirmé.', 'success', 'map-pin');
      } catch (error) {
        if (['failed-precondition', 'not-found', 'permission-denied'].includes(error?.code)) {
          // Order moved past the point a destination can still be set (or vanished) — stop retrying.
          sessionStorage.removeItem(key);
        }
        console.warn('Delivery destination still not confirmed for', order.id, error);
      }
    }
  }

  const originalCustomer = MarketplacePages.initCustomer.bind(MarketplacePages);
  MarketplacePages.initCustomer = async function trackedCustomerDashboard() {
    await originalCustomer();
    const root = document.getElementById('customer-dashboard-root');
    if (!root) return;
    const orders = await MarketplaceData.list('orders', MarketplaceData.localKeys.orders);
    await recoverPendingDestinations(orders);
    buildCustomerTracker(root, orders);
  };

  const originalCourier = MarketplacePages.initCourier.bind(MarketplacePages);
  MarketplacePages.initCourier = async function trackedCourierDashboard() {
    await originalCourier();
    const root = document.getElementById('courier-dashboard-root');
    if (!root) return;
    const session = await MarketplaceData.requireRole('courier');
    if (!session) return;
    const jobs = await MarketplaceData.list('orders', MarketplaceData.localKeys.orders);
    appendCourierSharing(root, jobs, session.user.uid);
  };

  window.addEventListener('pagehide', () => {
    stopSubscriptions();
    [...courierWatches.keys()].forEach(stopCourierWatch);
  });
})();
