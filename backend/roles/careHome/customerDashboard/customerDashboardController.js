const { sendResponse } = require("../../../helperUtils/responseUtil");

const customerDashboardService = require("./customerDashboardService");

const getCustomerDashboard = async (req, res) => {
  try {
    const userId = req.params.userId || req.user?._id;
    const dashboard = await customerDashboardService.getCustomerDashboard({
      userId,
    });
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "dashboard_fetched_successfully",
      data: dashboard,
    });
  } catch (error) {
    console.error("Customer dashboard error:", error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
module.exports = { getCustomerDashboard };
