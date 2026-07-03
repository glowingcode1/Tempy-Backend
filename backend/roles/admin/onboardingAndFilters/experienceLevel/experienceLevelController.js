const experienceLevelService = require("./experienceLevelService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getExperienceLevels = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.user === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { experienceLevels } = await experienceLevelService.getExperienceLevels(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "experienceLevels_found",
      data: experienceLevels,
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

const getExperienceLevelById = async (req, res) => {
  const { id } = req.params;

  try {
    const experienceLevel = await experienceLevelService.getExperienceLevelById(id);
    if (!experienceLevel || experienceLevel.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "experienceLevel_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "experienceLevel_found",
      data: experienceLevel,
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

const createExperienceLevel = async (req, res) => {
  const { title, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedExperienceLevel = await experienceLevelService.createExperienceLevel({
      title,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "experienceLevel_created",
      data: savedExperienceLevel,
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

const updateExperienceLevel = async (req, res) => {
  const { id } = req.params;

  const { title, status } = req.body;

  try {
    const updatedExperienceLevel = await experienceLevelService.updateExperienceLevel(id, {
      title,
      status,
    });

    if (!updatedExperienceLevel) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "experienceLevel_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "experienceLevel_updated",
      data: updatedExperienceLevel,
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

const deleteExperienceLevel = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedExperienceLevel = await experienceLevelService.deleteExperienceLevel(id);
    if (!deletedExperienceLevel) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "experienceLevel_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "experienceLevel_deleted",
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
  getExperienceLevels,
  getExperienceLevelById,
  createExperienceLevel,
  updateExperienceLevel,
  deleteExperienceLevel,
};
