const {
  sendResponse,
  getReadableErrorMessage,
} = require("@helperUtils/responseUtil");

const homeService = require("./customerHomeService");

const getHome = async (req, res) => {
  try {
    const userId = req.user?._id;
    const timezone = req.user?.timezone || "UTC";
    const userType = req.user?.userType;

    const home = await homeService.getHome({
      userId,
      timezone,
      userType,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "home_fetched_successfully",
      data: home,
    });
  } catch (error) {
    console.error("Customer Home API error:", error);

    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode || 500,
      translationKey: readableError.message || "internal_server",
      error,
    });
  }
};

module.exports = {
  getHome,
};
