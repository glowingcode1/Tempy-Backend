const priceRangeService = require("./priceRangeService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getPriceRanges = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { priceRanges } = await priceRangeService.getPriceRanges(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "price_ranges_found",
      data: priceRanges,
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

const getPriceRangeById = async (req, res) => {
  const { id } = req.params;

  try {
    const priceRange = await priceRangeService.getPriceRangeById(id);
    if (!priceRange || priceRange.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "price_range_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "price_range_found",
      data: priceRange,
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

const createPriceRange = async (req, res) => {
  const { price, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["price"],
    })) return;

    const savedPriceRange = await priceRangeService.createPriceRange({
      price,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "price_range_created",
      data: savedPriceRange,
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

const updatePriceRange = async (req, res) => {
  const { id } = req.params;

  const { price, status } = req.body;

  try {
    const updatedPriceRange = await priceRangeService.updatePriceRange(id, {
      price,
      status,
    });

    if (!updatedPriceRange) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "price_range_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "price_range_updated",
      data: updatedPriceRange,
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

const deletePriceRange = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedPriceRange = await priceRangeService.deletePriceRange(id);
    if (!deletedPriceRange) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "price_range_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "price_range_deleted",
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
  getPriceRanges,
  getPriceRangeById,
  createPriceRange,
  updatePriceRange,
  deletePriceRange,
};
