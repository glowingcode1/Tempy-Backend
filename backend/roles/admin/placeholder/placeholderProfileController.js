const placeholderProfileService = require("./placeholderProfileService");
const {
  sendResponse,
  getReadableErrorMessage,
  validateParams,
  convertTimezoneToUtc,
  parsePaginationParams,
} = require("@helperUtils/responseUtil");
const moment = require("moment");

const getPlaceholderProfile = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const {status} = req.query;
  const filter = {
    status: status || { $ne: "deleted" },
  };
  const skip = (page - 1) * limit;
  try {
    const { placeholderProfile, meta } = await placeholderProfileService.getPlaceholderProfile(
      filter,
      skip,
      limit,
      page,
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "PlaceholderProfile_found",
      data: placeholderProfile,
      meta,
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



const createPlaceholderProfile = async (req, res) => {
  try {
    const timezone = req.user?.timezone || "UTC";

    if (
      !validateParams(req, res, {
        rawData: ["name", "instagramHandle"],
      })
    )
      return;
    if(req.body.notification){
      req.body.notifyUsers = req.user._id;
    }

    const payload = {
      ...req.body,
      user: req.user?._id,
    };


    const savedPlaceholderProfile = await placeholderProfileService.createPlaceholderProfile(payload, timezone);
    if(savedPlaceholderProfile.error){
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: savedPlaceholderProfile.error,
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "PlaceholderProfile_created",
      data: savedPlaceholderProfile,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const updatePlaceholderProfile = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.userType === "admin" ? null : req.user?._id;
  const timezone = req.user?.timezone || "UTC";

  try {
    if (
      req.body.status &&
      !validateParams(req, res, {
        enumFields: {
          status: ["active", "inactive", "completed", "deleted"],
        },
      })
    )
      return;

    const payload = {
      ...req.body,
    };

    if (payload.date) {
      payload.date = convertTimezoneToUtc(payload.date, timezone, "");
    }

    const updatedPlaceholderProfile = await placeholderProfileService.updatePlaceholderProfile(
      id,
      payload,
      userId,
      timezone,
    );

    if (!updatedPlaceholderProfile) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "PlaceholderProfile_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "PlaceholderProfile_updated",
      data: updatedPlaceholderProfile,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);

    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const deletePlaceholderProfile = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.userType === "admin" ? null : req.user?._id;
  const timezone = req.user?.timezone || "UTC";

  try {
    const deletedPlaceholderProfile = await placeholderProfileService.deletePlaceholderProfile(id, userId, timezone);

    if (!deletedPlaceholderProfile) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "PlaceholderProfile_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "PlaceholderProfile_deleted",
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
const getDateRange = ({
  date,
  startDate,
  endDate,
  range = "month",
  timezone = "Asia/Karachi",
}) => {
  const allowedRanges = ["day", "week", "month"];

  if (!allowedRanges.includes(range)) {
    throw new Error("Invalid range. Use day, week, or month.");
  }

  // Custom date range
  if (startDate && endDate) {
    const start = moment.tz(startDate, timezone);
    const end = moment.tz(endDate, timezone);

    if (!start.isValid() || !end.isValid()) {
      throw new Error("Invalid startDate or endDate.");
    }

    if (start.isAfter(end)) {
      throw new Error("startDate cannot be greater than endDate.");
    }

    return {
      startDate: start.startOf("day").utc().toDate(),
      endDate: end.endOf("day").utc().toDate(),
    };
  }

  // Single date range
  const selectedDate = date || new Date();
  const m = moment.tz(selectedDate, timezone);

  if (!m.isValid()) {
    throw new Error("Invalid date.");
  }

  return {
    startDate: m.clone().startOf(range).utc().toDate(),
    endDate: m.clone().endOf(range).utc().toDate(),
  };
};

module.exports = {
  getPlaceholderProfile,
  createPlaceholderProfile,
  updatePlaceholderProfile,
  deletePlaceholderProfile,
};
