'use strict';

const marketplace = require('./marketplace-v3');
const checkout = require('./checkout-v4');
const catalog = require('./catalog-v5');
const roleApproval = require('./role-approval');
const audit = require('./audit');
const tracking = require('./tracking');
const notifications = require('./notifications');
const identity = require('./identity');
const adminControlCenter = require('./admin-control-center');
const supportOperations = require('./support-operations');
const riskOperations = require('./risk-operations');

module.exports = {
  ...marketplace,
  ...checkout,
  ...catalog,
  ...roleApproval,
  ...adminControlCenter,
  ...supportOperations,
  ...riskOperations,
  auditOrderWrites: audit.auditOrderWrites,
  auditProductWrites: audit.auditProductWrites,
  auditRoleRequestWrites: audit.auditRoleRequestWrites,
  auditProfileWrites: audit.auditProfileWrites,
  auditDeliveryJobWrites: audit.auditDeliveryJobWrites,
  auditEarningWrites: audit.auditEarningWrites,
  listAuditEvents: audit.listAuditEvents,
  listOrdersForRole: tracking.listOrdersForRole,
  syncOrderTracking: tracking.syncOrderTracking,
  setDeliveryDestination: tracking.setDeliveryDestination,
  updateCourierLocation: tracking.updateCourierLocation,
  notifyOrderChanges: notifications.notifyOrderChanges,
  notifyCourierNearby: notifications.notifyCourierNearby,
  markNotificationRead: notifications.markNotificationRead,
  markAllNotificationsRead: notifications.markAllNotificationsRead,
  registerCustomerProfile: identity.registerCustomerProfile,
  getMyIdentity: identity.getMyIdentity,
  updateMyProfile: identity.updateMyProfile
};
