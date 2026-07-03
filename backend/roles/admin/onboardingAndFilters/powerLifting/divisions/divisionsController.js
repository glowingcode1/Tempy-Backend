const divisionsService = require("./divisionsService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getDivisions = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { divisions } = await divisionsService.getDivisions(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "divisions_found",
      data: divisions,
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

const getDivisionById = async (req, res) => {
  const { id } = req.params;

  try {
    const division = await divisionsService.getDivisionById(id);
    if (!division || division.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "division_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "division_found",
      data: division,
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

const createDivision = async (req, res) => {
  const { title, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedDivision = await divisionsService.createDivision({
      title,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "division_created",
      data: savedDivision,
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

const updateDivision = async (req, res) => {
  const { id } = req.params;

  const { title, status } = req.body;

  try {
    const updatedDivision = await divisionsService.updateDivision(id, {
      title,
      status,
    });

    if (!updatedDivision) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "division_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "division_updated",
      data: updatedDivision,
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

const deleteDivision = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedDivision = await divisionsService.deleteDivision(id);
    if (!deletedDivision) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "division_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "division_deleted",
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
  getDivisions,
  getDivisionById,
  createDivision,
  updateDivision,
  deleteDivision,
};
