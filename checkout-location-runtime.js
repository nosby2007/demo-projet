/* Optional customer drop-off pin for live delivery tracking. */
'use strict';

(function checkoutLocationRuntime() {
  const mapElement = document.getElementById('checkout-location-map');
  const statusElement = document.getElementById('checkout-location-status');
  const locateButton = document.getElementById('checkout-use-location');
  if (!mapElement || !statusElement || !locateButton) return;

  const state = { location: null, map: null, marker: null };
  const emirateCenters = {
    'Abu Dhabi': [24.4539, 54.3773],
    Dubai: [25.2048, 55.2708],
    Sharjah: [25.3463, 55.4209],
    Ajman: [25.4052, 55.5136],
    'Al Ain': [24.1302, 55.8023],
    'Ras Al Khaimah': [25.8007, 55.9762],
    Fujairah: [25.1288, 56.3265],
    'Umm Al Quwain': [25.5647, 55.5552]
  };

  function setStatus(message, tone = 'muted') {
    statusElement.textContent = message;
    statusElement.dataset.tone = tone;
  }

  function setPoint(latitude, longitude, accuracyMeters, source) {
    const point = {
      latitude: Number(latitude.toFixed(5)),
      longitude: Number(longitude.toFixed(5)),
      accuracyMeters: Number.isFinite(accuracyMeters) ? Math.round(accuracyMeters) : 25,
      capturedAt: Date.now(),
      source
    };
    state.location = point;
    if (state.marker) state.marker.setLatLng([point.latitude, point.longitude]);
    else state.marker = window.L.marker([point.latitude, point.longitude]).addTo(state.map);
    state.map.setView([point.latitude, point.longitude], 16);
    setStatus(`Point confirmé · précision environ ${point.accuracyMeters} m`, 'success');
  }

  if (!window.L) {
    setStatus('La carte n’a pas pu être chargée. Vous pourrez définir le point depuis Mes commandes.', 'warning');
    locateButton.disabled = true;
    return;
  }

  state.map = window.L.map(mapElement, { scrollWheelZoom: false }).setView(emirateCenters['Abu Dhabi'], 10);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);

  state.map.on('click', event => {
    setPoint(event.latlng.lat, event.latlng.lng, 25, 'customer_map');
  });

  document.getElementById('co-emirate')?.addEventListener('change', event => {
    const center = emirateCenters[event.target.value];
    if (center && !state.location) state.map.setView(center, 12);
  });

  locateButton.addEventListener('click', () => {
    if (!navigator.geolocation) {
      setStatus('La géolocalisation n’est pas disponible sur cet appareil.', 'warning');
      return;
    }
    locateButton.disabled = true;
    setStatus('Recherche de votre position…');
    navigator.geolocation.getCurrentPosition(position => {
      locateButton.disabled = false;
      setPoint(
        position.coords.latitude,
        position.coords.longitude,
        position.coords.accuracy,
        'customer_gps'
      );
    }, error => {
      locateButton.disabled = false;
      const message = error.code === 1
        ? 'Autorisation refusée. Touchez directement la carte pour placer le point.'
        : 'Position indisponible. Touchez directement la carte pour placer le point.';
      setStatus(message, 'warning');
    }, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 30000
    });
  });

  window.SokivaDeliveryLocation = Object.freeze({
    get() {
      return state.location ? { ...state.location } : null;
    }
  });
})();
