'use strict';

const marketplace = require('./marketplace-v3');
const roleApproval = require('./role-approval');

module.exports = {
  ...marketplace,
  approveRoleRequest: roleApproval.approveRoleRequest
};
