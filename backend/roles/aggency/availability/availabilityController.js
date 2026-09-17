const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");
const AvailabilityService = require("./availabilityService");
const { AVAILABILITY_STATUSES } = require("./availabilityRepository");

const isValidDate = (value) => !Number.isNaN(new Date(value).getTime());

const requesterOf = (req) => ({
  _id: req.user._id,
  userType: req.user.userType,
});

const createAvailability = async (req, res) => {
  let { user, status , startDateTime, endDateTime } = req.body;
  const creator = req.user._id;

  if (!user) {
    user = req.user._id;
  }

  if (
    !validateParams(req, res, {
      rawData: ["status", "startDateTime", "endDateTime"],
    })
  )
    return;

  if (!AVAILABILITY_STATUSES.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_availability_status",
    });
  }

  if (!isValidDate(startDateTime) || !isValidDate(endDateTime)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_availability_date",
    });
  }

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
    const availability = await AvailabilityService.createAvailability(
      data,
      requesterOf(req),
    );
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
        statusCode: availability.statusCode || 400,
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
  const { status, user, startDate, endDate, summary } = req.query;
  try {
    const timezone = req.user.timezone;

    if (status && !AVAILABILITY_STATUSES.includes(status)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_availability_status",
      });
    }

    if (
      (startDate && !isValidDate(startDate)) ||
      (endDate && !isValidDate(endDate))
    ) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_availability_date",
      });
    }

    // Without ?user=, a nurse gets their own entries and an agency its staff's.
    const result = await AvailabilityService.getAvailability(
      {
        timezone,
        page,
        limit,
        status,
        user,
        startDate,
        endDate,
        summary: summary === true || summary === "true",
      },
      requesterOf(req),
    );

    if (result.error) {
      return sendResponse({
        res,
        statusCode: result.statusCode || 400,
        translationKey: result.error,
      });
    }

    const { availability, meta } = result;

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

  if (status !== undefined && !AVAILABILITY_STATUSES.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_availability_status",
    });
  }

  if (
    (startDateTime !== undefined && !isValidDate(startDateTime)) ||
    (endDateTime !== undefined && !isValidDate(endDateTime))
  ) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_availability_date",
    });
  }

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
    const updated = await AvailabilityService.updateAvailability(
      id,
      data,
      requesterOf(req),
    );
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
    const deleted = await AvailabilityService.deleteAvailability(
      id,
      requesterOf(req),
    );
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
