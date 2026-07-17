'use strict';

const marketplace = require('./marketplace-v3');
const checkout = require('./checkout-v4');
const catalog = require('./catalog-v5');
const roleApproval = require('./role-approval');
const audit = require('./audit');

module.exports = {
  ...marketplace,
  ...checkout,
  ...catalog,
  ...roleApproval,
  auditOrderWrites: audit.auditOrderWrites,
  auditProductWrites: audit.auditProductWrites,
  auditRoleRequestWrites: audit.auditRoleRequestWrites,
  auditProfileWrites: audit.auditProfileWrites,
  auditDeliveryJobWrites: audit.auditDeliveryJobWrites,
  auditEarningWrites: audit.auditEarningWrites,
  listAuditEvents: audit.listAuditEvents
};
