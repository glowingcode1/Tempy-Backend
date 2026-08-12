const customerDashboardRepo = require("./customerDashboardRepository");

const getCustomerDashboard = async ({ userId }) => {
  return customerDashboardRepo.getCustomerDashboardStats({ userId });
};
module.exports = { getCustomerDashboard };
