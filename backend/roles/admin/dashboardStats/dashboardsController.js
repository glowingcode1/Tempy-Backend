
const { sendResponse } = require("@helperUtils/responseUtil");
const dashboardService = require("./dashboardService");
const getDashboard = async (req, res) => {
  let { timezone } = req.user.timezone || "UTC";
  const user = req.user._id;

  try {
    const dashboard = await dashboardService.getDashboard({ timezone, user });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "dashboard_fetched_successfully",
      data: dashboard,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};





module.exports = {
  getDashboard,
};
