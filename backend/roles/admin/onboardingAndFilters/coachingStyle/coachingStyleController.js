const coachingStyleService = require("./coachingStyleService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getCoachingStyles = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { coachingStyles } = await coachingStyleService.getCoachingStyles(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "coaching_styles_found",
      data: coachingStyles,
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

const getCoachingStyleById = async (req, res) => {
  const { id } = req.params;

  try {
    const coachingStyle = await coachingStyleService.getCoachingStyleById(id);
    if (!coachingStyle || coachingStyle.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "coaching_style_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "coaching_style_found",
      data: coachingStyle,
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

const createCoachingStyle = async (req, res) => {
  const { title, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedCoachingStyle = await coachingStyleService.createCoachingStyle({
      title,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "coaching_style_created",
      data: savedCoachingStyle,
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

const updateCoachingStyle = async (req, res) => {
  const { id } = req.params;

  const { title, status } = req.body;

  try {
    const updatedCoachingStyle = await coachingStyleService.updateCoachingStyle(id, {
      title,
      status,
    });

    if (!updatedCoachingStyle) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "coaching_style_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "coaching_style_updated",
      data: updatedCoachingStyle,
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

const deleteCoachingStyle = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedCoachingStyle = await coachingStyleService.deleteCoachingStyle(id);
    if (!deletedCoachingStyle) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "coaching_style_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "coaching_style_deleted",
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
  getCoachingStyles,
  getCoachingStyleById,
  createCoachingStyle,
  updateCoachingStyle,
  deleteCoachingStyle,
};
