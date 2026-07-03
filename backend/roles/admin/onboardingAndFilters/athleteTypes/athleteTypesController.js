const athleteTypesService = require("./athleteTypesService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getAthleteTypes = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { athleteTypes } = await athleteTypesService.getAthleteTypes(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "athlete_types_found",
      data: athleteTypes,
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

const getAthleteTypeById = async (req, res) => {
  const { id } = req.params;

  try {
    const athleteType = await athleteTypesService.getAthleteTypeById(id);
    if (!athleteType || athleteType.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "athlete_type_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "athlete_type_found",
      data: athleteType,
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

const createAthleteType = async (req, res) => {
  const { title, description, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedAthleteType = await athleteTypesService.createAthleteType({
      title,
      description,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "athlete_type_created",
      data: savedAthleteType,
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

const updateAthleteType = async (req, res) => {
  const { id } = req.params;

  const { title, description, status } = req.body;

  try {
    const updatedAthleteType = await athleteTypesService.updateAthleteType(id, {
      title,
      description,
      status,
    });

    if (!updatedAthleteType) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "athlete_type_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "athlete_type_updated",
      data: updatedAthleteType,
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

const deleteAthleteType = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedAthleteType = await athleteTypesService.deleteAthleteType(id);
    if (!deletedAthleteType) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "athlete_type_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "athlete_type_deleted",
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
  getAthleteTypes,
  getAthleteTypeById,
  createAthleteType,
  updateAthleteType,
  deleteAthleteType,
};
