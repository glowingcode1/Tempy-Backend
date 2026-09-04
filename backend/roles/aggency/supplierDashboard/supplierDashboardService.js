const supplierDashboardRepo = require("./supplierDashboardRepository");

const getSupplierDashboard = async ({ userId, timezone }) => {
  return supplierDashboardRepo.getSupplierDashboardStats({
    userId,
    timezone,
  });
};

module.exports = {
  getSupplierDashboard,
};
