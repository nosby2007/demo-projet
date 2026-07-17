'use strict';

const marketplace = require('./marketplace-v3');
const checkout = require('./checkout-v4');
const catalog = require('./catalog-v5');
const roleApproval = require('./role-approval');

module.exports = {
  ...marketplace,
  ...checkout,
  ...catalog,
  ...roleApproval
};
