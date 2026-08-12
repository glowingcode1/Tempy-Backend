const supplierDashboardRepo = require("./supplierDashboardRepository");

const getSupplierDashboard = async ({ userId }) => {
  return supplierDashboardRepo.getSupplierDashboardStats({
    userId,
  });
};

module.exports = {
  getSupplierDashboard,
};
