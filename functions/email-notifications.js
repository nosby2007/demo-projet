'use strict';

const sgMail = require('@sendgrid/mail');
const { defineSecret } = require('firebase-functions/params');

const SENDGRID_API_KEY = defineSecret('SENDGRID_API_KEY');
const SENDER_EMAIL = 'contact@innovacarereview.com';
const SENDER_NAME = 'SOKIVA';

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function formatMoney(value) {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(value || 0))} AED`;
}

function buildOrderConfirmationEmail(order, deliveryCode) {
  const to = clean(order?.email, 240);
  if (!to) throw new Error('La commande ne contient aucune adresse email cliente.');

  const orderId = clean(order.id, 160);
  const customerName = clean(order.customerName, 160);
  const items = Array.isArray(order.items) ? order.items : [];

  const itemLines = items.map(item => `- ${Number(item.quantity || 0)} x ${clean(item.name, 240)} — ${formatMoney(item.lineTotal)}`);
  const itemsHtml = items
    .map(item => `<li>${Number(item.quantity || 0)} x ${escapeHtml(item.name)} — ${formatMoney(item.lineTotal)}</li>`)
    .join('');

  const text = [
    customerName ? `Bonjour ${customerName},` : 'Bonjour,',
    '',
    `Votre commande ${orderId} est confirmée.`,
    '',
    'Articles :',
    ...itemLines,
    '',
    `Sous-total : ${formatMoney(order.subtotal)}`,
    `Livraison : ${formatMoney(order.shipping)}`,
    `Total (paiement à la livraison) : ${formatMoney(order.total)}`,
    '',
    `Livraison prévue : ${clean(order.emirate)}, ${clean(order.address)}`,
    deliveryCode ? `Votre code de remise (à communiquer uniquement au livreur à la réception) : ${clean(deliveryCode, 20)}` : '',
    '',
    'Merci de votre confiance.',
    'SOKIVA'
  ].filter(Boolean).join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; color: #0f172a; line-height: 1.6;">
      <h2>Commande confirmée</h2>
      <p>${customerName ? `Bonjour ${escapeHtml(customerName)},` : 'Bonjour,'}</p>
      <p>Votre commande <strong>${escapeHtml(orderId)}</strong> est confirmée.</p>
      <ul>${itemsHtml}</ul>
      <p>
        Sous-total : ${formatMoney(order.subtotal)}<br/>
        Livraison : ${formatMoney(order.shipping)}<br/>
        <strong>Total (paiement à la livraison) : ${formatMoney(order.total)}</strong>
      </p>
      <p>Livraison prévue : ${escapeHtml(order.emirate)}, ${escapeHtml(order.address)}</p>
      ${deliveryCode ? `<p><strong>Code de remise : ${escapeHtml(deliveryCode)}</strong><br/><small>À communiquer uniquement au livreur, au moment de la réception de votre colis.</small></p>` : ''}
      <p>Merci de votre confiance.<br/>SOKIVA</p>
    </div>`;

  return {
    to,
    from: { email: SENDER_EMAIL, name: SENDER_NAME },
    subject: `Confirmation de votre commande ${orderId}`,
    text,
    html
  };
}

async function sendOrderConfirmationEmail(order, deliveryCode) {
  try {
    const message = buildOrderConfirmationEmail(order, deliveryCode);
    sgMail.setApiKey(SENDGRID_API_KEY.value());
    await sgMail.send(message);
    return { sent: true };
  } catch (error) {
    console.error('Order confirmation email failed for', order?.id, error?.response?.body || error?.message || error);
    return { sent: false, error: clean(error?.message, 300) || 'unknown_error' };
  }
}

module.exports = {
  SENDGRID_API_KEY,
  SENDER_EMAIL,
  buildOrderConfirmationEmail,
  sendOrderConfirmationEmail
};
