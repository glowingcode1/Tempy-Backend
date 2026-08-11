const dashboardRepo = require("./dashboardRepository");

const getDashboard = async () => {
  return dashboardRepo.getDashboardStats();
};
module.exports = { getDashboard };
