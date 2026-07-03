const distancesRangeService = require("./distancesRangeService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getDistanceRanges = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { distanceRanges } = await distancesRangeService.getDistanceRanges(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "distance_ranges_found",
      data: distanceRanges,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

const getDistanceRangeById = async (req, res) => {
  const { id } = req.params;

  try {
    const distanceRange = await distancesRangeService.getDistanceRangeById(id);
    if (!distanceRange || distanceRange.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "distance_range_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "distance_range_found",
      data: distanceRange,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

const createDistanceRange = async (req, res) => {
  const { title, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedDistanceRange = await distancesRangeService.createDistanceRange({
      title,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "distance_range_created",
      data: savedDistanceRange,
    });
  } catch (error) {
    const duplicateError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error,
    });
  }
};

const updateDistanceRange = async (req, res) => {
  const { id } = req.params;

  const { title, status } = req.body;

  try {
    const updatedDistanceRange = await distancesRangeService.updateDistanceRange(id, {
      title,
      status,
    });

    if (!updatedDistanceRange) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "distance_range_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "distance_range_updated",
      data: updatedDistanceRange,
    });
  } catch (error) {
    const duplicateError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: duplicateError.statusCode,
      translationKey: duplicateError.message,
      error,
    });
  }
};

const deleteDistanceRange = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedDistanceRange = await distancesRangeService.deleteDistanceRange(id);
    if (!deletedDistanceRange) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "distance_range_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "distance_range_deleted",
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: error.message,
      error,
    });
  }
};

module.exports = {
  getDistanceRanges,
  getDistanceRangeById,
  createDistanceRange,
  updateDistanceRange,
  deleteDistanceRange,
};
