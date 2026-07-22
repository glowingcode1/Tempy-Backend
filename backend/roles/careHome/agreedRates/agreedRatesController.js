const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("../../../helperUtils/responseUtil");

const AgreedRateService = require("./agreedRatesService");

const RATE_TYPES = ["hourly", "fixed"];

const createAgreedRate = async (req, res) => {
  let { objectType, objectId, jobType, rateType, rate, autoAssign } =
    req.body;
  let user = req.user._id;

  if (req.user.userType === "admin") {
    if (!req.body.userId) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "userId_required",
      });
    }
    user = req.body.userId;
  }

  if (
    !validateParams(req, res, {
      rawData: ["objectType", "objectId", "jobType", "rateType", "rate"],
      objectIdFields: ["objectId", "jobType"],
    })
  )
    return;

  if (!RATE_TYPES.includes(rateType)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "rateType_must_be_hourly_or_fixed",
    });
  }

  if (!(Number(rate) > 0)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "rate_must_be_greater_than_zero",
    });
  }

  const data = {
    user,
    objectType,
    objectId,
    jobType,
    rateType,
    rate,
    autoAssign,
  };

  try {
    const agreedRate = await AgreedRateService.createAgreedRate(data);

    if (agreedRate && agreedRate.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: agreedRate.error,
      });
    }

    if (!agreedRate) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "AgreedRate_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "AgreedRate_created_successfully",
      data: agreedRate,
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

const getAgreedRates = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, objectType, objectId, jobType, user } =
    req.query;

  // non-admins only ever see their own agreed rates
  if (req.user.userType !== "admin") {
    user = req.user._id;
  }

  try {
    const timezone = req.user.timezone;
    const { AgreedRates, meta } = await AgreedRateService.getAgreedRates({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      objectType,
      objectId,
      jobType,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "AgreedRates_fetched_successfully",
      data: AgreedRates,
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

const updateAgreedRate = async (req, res) => {
  const { id } = req.params;
  const {
    objectType,
    objectId,
    jobType,
    rateType,
    rate,
    autoAssign,
    status,
  } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  if (rateType && !RATE_TYPES.includes(rateType)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "rateType_must_be_hourly_or_fixed",
    });
  }

  if (rate !== undefined && !(Number(rate) > 0)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "rate_must_be_greater_than_zero",
    });
  }

  const data = {
    objectType,
    objectId,
    jobType,
    rateType,
    rate,
    autoAssign,
    status,
  };

  try {
    const updated = await AgreedRateService.updateAgreedRate(id, data);

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
        translationKey: "AgreedRate_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "AgreedRate_updated_successfully",
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

const deleteAgreedRate = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await AgreedRateService.deleteAgreedRate(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "AgreedRate_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "AgreedRate_deleted_successfully",
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
  createAgreedRate,
  getAgreedRates,
  updateAgreedRate,
  deleteAgreedRate,
};
