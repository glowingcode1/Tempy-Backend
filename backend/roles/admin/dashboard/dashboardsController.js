const { sendResponse } = require("../../../helperUtils/responseUtil");

const dashboardService = require("./dashboardService");

const getDashboard = async (req, res) => {
  try {
    const dashboard = await dashboardService.getDashboard();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "dashboard_fetched_successfully",
      data: dashboard,
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
module.exports = { getDashboard };
