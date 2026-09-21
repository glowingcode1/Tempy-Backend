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
const { customerTypes, supplierTypes, User } = require("@UsersModel");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
// const { isUserProfileComplete } = require("@helperUtils/userResponseUtil");

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

  // if (req.user.userType !== "admin") {
  //   const currentUser = await User.findById(req.user._id)
  //     .select(
  //       "accountState userType location governmentIdentity taxNumber degree certification companyName registrationNumber validationDocument",
  //     )
  //     .lean();
  //   if (!isUserProfileComplete(currentUser)) {
  //     return sendResponse({
  //       res,
  //       statusCode: 403,
  //       translationKey: "complete_profile_details_required",
  //     });
  //   }
  // }

  let data = {
    user,
    shift,
    job,
    bid,
    note,
  };
  try {
    const Bid = await BidService.createBid(data, timezone);
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

    if (Bid.jobCreator) {
      const jobName = Bid.snapshot?.name;

      void sendUserNotifications({
        recipientIds: [Bid.jobCreator],

        title: "New Bid Received",

        body: `New Bid ${bid} on your job ${jobName}.`,

        data: {
          type: NotificationTypes.NEW_BID,
          objectType: "Bid",
        },

        sender: user,

        objectId: Bid._id,

        saveNotification: true,
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
  let { keyword, status, user, dateFilter } = req.query;

  const idOfBider = req.user._id;

  const customer = await customerTypes.includes(req.user.userType);
  const supplier = await supplierTypes.includes(req.user.userType);
  let jobCreator = req.user._id;
  if (customer) {
    jobCreator = req.user._id;
  } else if (supplier) {
    user = req.user._id;
    jobCreator = null;
  }

  if (req.user.userType === "admin") {
    ((user = null), (jobCreator = null));
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
      jobCreator,
      dateFilter,
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
    userType: req.user.userType,
    shift,
    job,
    bid,
    note,
    status,
  };
  try {
    const updated = await BidService.updateBid(id, data, req.user.timezone);
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

    // The customer may have been counting on this bid, or have just lost a
    // winner and seen the shift reopen.
    if (status === "withdraw" && updated.jobCreator) {
      void sendUserNotifications({
        recipientIds: [updated.jobCreator],
        title: "Bid Withdrawn",
        body: `A bid on your job ${updated.snapshot?.name || ""} has been withdrawn.`,
        data: {
          type: NotificationTypes.BID_WITHDRAWN,
          objectType: "Bid",
          jobId: updated.job,
          status,
        },
        sender: user,
        objectId: updated._id,
        saveNotification: true,
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
    const job = await BidService.getBidDetails(id, timezone, {
      requesterId: req.user._id,
      isAdmin: req.user.userType === "admin",
    });
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
    const deleted = await BidService.deleteBid(id, {
      requesterId: req.user._id,
      isAdmin: req.user.userType === "admin",
    });
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Bid_not_found",
      });
    }
    if (deleted.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: deleted.error,
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
