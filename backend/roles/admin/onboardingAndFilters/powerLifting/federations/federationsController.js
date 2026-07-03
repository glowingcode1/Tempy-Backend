const federationsService = require("./federationsService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getFederations = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { federations } = await federationsService.getFederations(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "federations_found",
      data: federations,
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

const getFederationById = async (req, res) => {
  const { id } = req.params;

  try {
    const federation = await federationsService.getFederationById(id);
    if (!federation || federation.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "federation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "federation_found",
      data: federation,
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

const createFederation = async (req, res) => {
  const { title, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedFederation = await federationsService.createFederation({
      title,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "federation_created",
      data: savedFederation,
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

const updateFederation = async (req, res) => {
  const { id } = req.params;

  const { title, status } = req.body;

  try {
    const updatedFederation = await federationsService.updateFederation(id, {
      title,
      status,
    });

    if (!updatedFederation) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "federation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "federation_updated",
      data: updatedFederation,
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

const deleteFederation = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedFederation = await federationsService.deleteFederation(id);
    if (!deletedFederation) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "federation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "federation_deleted",
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
  getFederations,
  getFederationById,
  createFederation,
  updateFederation,
  deleteFederation,
};
