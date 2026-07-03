const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment");
const BidService = require("./bidService");

const createBid = async (req, res) => {
  let { shift, job, bid, note } = req.body;
  let user = req.user._id;
  const timezone = req.user.timezone;
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
      rawData: ["shift", "job", "bid"],
    })
  )
    return;

  let data = {
    user,
    shift,
    job,
    bid,
    note,
  };
  try {
    const Bid = await BidService.createBid(data);
    if (!Bid) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Bid_creation_failed",
      });
    }
    if (Bid && Bid.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: Bid.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Bid_created_successfully",
      data: Bid,
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

const getBid = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, user } = req.query;
  const isAgency = req.user.userType === "agency";
  if (isAgency) {
    user = req.user._id;
  }
  try {
    const timezone = req.user.timezone;
    const { bid, meta } = await BidService.getBid({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Bid_fetched_successfully",
      data: bid,
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
const updateBid = async (req, res) => {
  const { id } = req.params;
  let { shift, job, bid, note, status } = req.body;
  const isAgency = req.user.userType === "agency";
  const allowedStatusesAgency = ["withdraw"];

  if (isAgency && status && !allowedStatusesAgency.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "the_status_is_not_allowed_for_agency",
    });
  }
  if (Boolean(job) !== Boolean(shift)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "both_job_and_shift_are_required",
    });
  }

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;
  
  const user = req.user._id;

  let data = {
    user,
    shift,
    job,
    bid,
    note,
    status,
  };
  try {
    const updated = await BidService.updateBid(id, data);
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
        translationKey: "Bid_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Bid_updated_successfully",
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

const getBidDetails = async (req, res) => {
  const { id } = req.params;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const job = await BidService.getBidDetails(id, timezone);
    if (!job) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Bid_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Bid_fetched_successfully",
      data: job,
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
const deleteBid = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await BidService.deleteBid(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Bid_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Bid_deleted_successfully",
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
  createBid,
  getBid,
  updateBid,
  deleteBid,
  getBidDetails,
};
