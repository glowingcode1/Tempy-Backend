const timezonesService = require("./timezonesService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
} = require("@helperUtils/responseUtil");

const getTimezones = async (req, res) => {
  const { status } = req.query;

  let filter = { status: { $eq: "active" } }; // Default to active

  if (req.user && req.user.userType === "admin" && status) {
    filter.status = status; // Allow admin to filter by status
  }

  try {
    const { timezones } = await timezonesService.getTimezones(filter);

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "timezones_found",
      data: timezones,
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

const getTimezoneById = async (req, res) => {
  const { id } = req.params;

  try {
    const timezone = await timezonesService.getTimezoneById(id);
    if (!timezone || timezone.status === "deleted") {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "timezone_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "timezone_found",
      data: timezone,
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

const createTimezone = async (req, res) => {
  const { title, status } = req.body;

  try {
    if (!validateParams(req, res, {
      rawData: ["title"],
    })) return;

    const savedTimezone = await timezonesService.createTimezone({
      title,
      status,
    });

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "timezone_created",
      data: savedTimezone,
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

const updateTimezone = async (req, res) => {
  const { id } = req.params;

  const { title, status } = req.body;

  try {
    const updatedTimezone = await timezonesService.updateTimezone(id, {
      title,
      status,
    });

    if (!updatedTimezone) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "timezone_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "timezone_updated",
      data: updatedTimezone,
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

const deleteTimezone = async (req, res) => {
  const { id } = req.params;

  try {
    const deletedTimezone = await timezonesService.deleteTimezone(id);
    if (!deletedTimezone) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "timezone_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "timezone_deleted",
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
  getTimezones,
  getTimezoneById,
  createTimezone,
  updateTimezone,
  deleteTimezone,
};
