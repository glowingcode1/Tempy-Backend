const { sendResponse } = require("../../../helperUtils/responseUtil");
const supplierDashboardService = require("./supplierDashboardService");

const getSupplierDashboard = async (req, res) => {
  try {
    const userId = req.params.userId || req.user?._id;

    const dashboard = await supplierDashboardService.getSupplierDashboard({
      userId,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "dashboard_fetched_successfully",
      data: dashboard,
    });
  } catch (error) {
    console.error("Supplier dashboard error:", error);

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};

module.exports = {
  getSupplierDashboard,
};
