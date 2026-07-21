const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");
const AvailabilityService = require("./availabilityService");

const createAvailability = async (req, res) => {
  let { user, status , startDateTime, endDateTime } = req.body;
  const creator = req.user._id;

  if (!user) {
    user = req.user._id;
  }

  if (
    !validateParams(req, res, {
      rawData: ["startDateTime", "endDateTime"],
    })
  )
    return;

  if (new Date(startDateTime) >= new Date(endDateTime)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "startDateTime_must_be_before_endDateTime",
    });
  }

  const data = {
    creator,
    user,
    status,
    startDateTime,
    endDateTime,
  };

  try {
    const availability = await AvailabilityService.createAvailability(data);
    if (!availability) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Availability_creation_failed",
      });
    }
    if (availability && availability.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: availability.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Availability_created_successfully",
      data: availability,
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

const getAvailability = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, user, startDate, endDate, summary } = req.query;
  try {
    const timezone = req.user.timezone;
    if(!user){
      user = req.user._id;
    }
    const { availability, meta } = await AvailabilityService.getAvailability({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      startDate,
      endDate,
      summary,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Availability_fetched_successfully",
      data: availability,
      meta,
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

const updateAvailability = async (req, res) => {
  const { id } = req.params;
  let { status, startDateTime, endDateTime } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  if (
    startDateTime &&
    endDateTime &&
    new Date(startDateTime) >= new Date(endDateTime)
  ) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "startDateTime_must_be_before_endDateTime",
    });
  }

  const data = {
    status,
    startDateTime,
    endDateTime,
  };

  try {
    const updated = await AvailabilityService.updateAvailability(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Availability_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Availability_updated_successfully",
      data: updated,
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

const deleteAvailability = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await AvailabilityService.deleteAvailability(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Availability_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Availability_deleted_successfully",
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

module.exports = {
  createAvailability,
  getAvailability,
  updateAvailability,
  deleteAvailability,
};
