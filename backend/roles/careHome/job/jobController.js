const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment-timezone");
const JobService = require("./jobService");
const { customerTypes, supplierTypes, User } = require("@UsersModel");
const { buildProjection } = require("@helperUtils/buildProjection");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");
// const { isUserProfileComplete } = require("@helperUtils/userResponseUtil");

const createJob = async (req, res) => {
  let {
    name,
    description,
    type,
    gender,
    shift,
    location,
    branch,
    image,
    worker,
    employer,
    notes,
    instructions,
    contactDetails,
    emergencyContact,
    documents,
  } = req.body;
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
      rawData: ["name", "type", "shift", "location"],
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
  if (shift && !Array.isArray(shift)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "shift_must_be_array",
    });
  }
  if (Array.isArray(req.body.shift)) {
    const bad = req.body.shift.findIndex((s) => s.isBreak && !s.breakMin);
    if (bad !== -1) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "breakMin_required_when_isBreak_true",
      });
    }
  }
  // Validate every shift up front. A `return` inside .map() does not stop the
  // loop, so validating during the mapping would send one response per bad
  // shift and then fall through to send another.
  const nowUtc = moment.utc();

  for (const job of shift) {
    if (job.perHour <= 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "perHour_must_be_greater_than_zero",
      });
    }

    // Interpret the submitted date/time in the creator's timezone.
    const startUtc = moment
      .tz(`${job.date} ${job.startTime}`, "YYYY-MM-DD HH:mm", timezone)
      .utc();

    if (!startUtc.isValid()) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_shift_date_or_time",
      });
    }

    // A shift may not start in the past.
    if (startUtc.isSameOrBefore(nowUtc)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "shift_cannot_be_in_the_past",
      });
    }
  }

  const convertedJobs = shift.map((job) => {
    const startUtc = moment
      .tz(`${job.date} ${job.startTime}`, "YYYY-MM-DD HH:mm", timezone)
      .utc();

    const endUtc = moment
      .tz(`${job.date} ${job.endTime}`, "YYYY-MM-DD HH:mm", timezone)
      .utc();

    return {
      ...job,
      date: startUtc.format("YYYY-MM-DD"),
      startTime: startUtc.format("HH:mm"),
      endTime: endUtc.format("HH:mm"),
    };
  });
  if (employer && !worker) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "worker_required_when_employer_provided",
    });
  }

  const uploadedDocuments = (req.files || []).map(
    (file) => file.location || file.path,
  );

  let data = {
    name,
    description,
    type,
    gender,
    shift: convertedJobs,
    user,
    location,
    branch,
    image,
    worker,
    employer,
    notes,
    instructions,
    contactDetails,
    emergencyContact,
    documents: [...(documents || []), ...uploadedDocuments],
  };
  try {
    const Job = await JobService.createJob(data, timezone);
    if (!Job) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Job_creation_failed",
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Job_created_successfully",
      data: Job,
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

const getJobs = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, dateFilter, user, latitude, longitude, km, summary } =
    req.query;
  const customer = await customerTypes.includes(req.user.userType);
  const supplier = await supplierTypes.includes(req.user.userType);
  let employer = null;
  let worker = null;
  if (supplier) {
    employer = req.user._id;
  }
  if (req.user.userType === "nurse") {
    worker = req.user._id;
  }

  const JOB_FIELDS = [
    "name",
    "description",
    "location",
    "notes",
    "instructions",
    "contactDetails",
    "emergencyContact",
    "documents",
  ];
  const fields = "name,location";
  let projection = undefined;
  if (summary) {
    projection = await buildProjection(fields, JOB_FIELDS);
  }

  let userType = req.user.userType;
  let requester = req.user._id;
  if (customer) {
    user = req.user._id;
    userType = null;
  }
  const geoProvided = [latitude, longitude, km].filter(
    (v) => v !== undefined && v !== null && v !== "",
  );
  const userCoordinates = req.user.location?.coordinates;
  const distanceOrigin =
    geoProvided.length === 0 &&
    Array.isArray(userCoordinates) &&
    userCoordinates.length === 2
      ? userCoordinates
      : undefined;

  if (geoProvided.length > 0) {
    if (geoProvided.length < 3) {
      return res.status(400).json({
        success: false,
        message: "latitude, longitude and km must all be provided together.",
      });
    }

    const lat = Number(latitude);
    const lng = Number(longitude);
    const radius = Number(km);

    if (isNaN(lat) || isNaN(lng) || isNaN(radius)) {
      return res.status(400).json({
        success: false,
        message: "latitude, longitude and km must be valid numbers.",
      });
    }

    if (lat < -90 || lat > 90) {
      return res.status(400).json({
        success: false,
        message: "latitude must be between -90 and 90.",
      });
    }

    if (lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: "longitude must be between -180 and 180.",
      });
    }
    if (radius <= 0) {
      return res.status(400).json({
        success: false,
        message: "km must be greater than 0.",
      });
    }
  }

  try {
    const timezone = req.user.timezone;
    const { Jobs, meta } = await JobService.getJobs({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      userType,
      requester,
      latitude:
        latitude !== undefined && latitude !== "" ? Number(latitude) : undefined,
      longitude:
        longitude !== undefined && longitude !== "" ? Number(longitude) : undefined,
      km: km !== undefined && km !== "" ? Number(km) : undefined,
      projection,
      summary: summary === "true" ? true : false,
      worker,
      employer,
      dateFilter,
      distanceOrigin,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Jobs_fetched_successfully",
      data: Jobs,
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
const updateJobBids = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  let user = null;
  const isAdmin = req.user.userType === "admin";
  if (!isAdmin) user = req.user._id;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
      rawData: ["status"],
    })
  )
    return;

  try {
    const result = await JobService.updateJobBidStatus(id, status, user);

    if (!result) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "JobBid_not_found",
      });
    }
    if (result.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.error,
      });
    }

    const { updatedBid, booking, isNurse } = result;

    // 1) always tell the bid creator (supplier) what happened to their bid
    if (updatedBid?.user) {
      let title = "Bid Status Updated";
      let body = `Your bid status has been updated to ${status}.`;
      let notificationType = NotificationTypes.GENERAL;

      if (status === "accepted") {
        title = "Bid Accepted";
        body = isNurse
          ? "Your bid has been accepted. You're booked for the shift."
          : "Your bid has been accepted. Please assign a worker to this job.";
        notificationType = NotificationTypes.BID_ACCEPTED;
      } else if (status === "rejected") {
        title = "Bid Rejected";
        body = "Your bid has been rejected by the customer.";
        notificationType = NotificationTypes.BID_REJECTED;
      } else if (status === "withdraw") {
        title = "Bid Withdrawn";
        body = "The bid has been withdrawn.";
        notificationType = NotificationTypes.BID_WITHDRAWN;
      }

      void sendUserNotifications({
        recipientIds: [updatedBid.user],
        title,
        body,
        data: {
          type: notificationType,
          objectType: "Bid",
          jobId: updatedBid.job,
          status,
        },
        sender: req.user._id,
        objectId: updatedBid._id,
        saveNotification: true,
      });
    }

    // 2) direct-nurse acceptance also created a booking — tell the job creator
    if (
      status === "accepted" &&
      isNurse &&
      booking &&
      !booking.error &&
      updatedBid?.jobCreator
    ) {
      void sendUserNotifications({
        recipientIds: [updatedBid.jobCreator],
        title: "Booking Created",
        body: "A nurse has been booked for your job.",
        data: {
          type: NotificationTypes.NEW_BOOKING,
          objectType: "Booking",
          jobId: updatedBid.job,
        },
        sender: req.user._id,
        objectId: booking._id,
        saveNotification: true,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "JobBid_status_updated_successfully",
      data: updatedBid,
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
const getJobBids = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { job, shift, keyword, status, dateFilter } = req.query;
  const timezone = req.user.timezone;
  const customer = await customerTypes.includes(req.user.userType);
  const supplier = await supplierTypes.includes(req.user.userType);
  const isAdmin = req.user.userType === "admin";

  let user = req.user._id;
  let jobCreator = req.user._id;
  if (isAdmin) {
    user = null;
    jobCreator = null;
  }
  if (supplier) {
    jobCreator = null;
  } else if (customer) {
    user = null;
  }

  try {
    const { jobBids, meta } = await JobService.getJobBids({
      timezone,
      page,
      limit,
      keyword,
      status,
      job,
      shift,
      user,
      jobCreator,
      dateFilter,
    });
    if (!jobBids) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "JobBids_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "JobBids_fetched_successfully",
      data: jobBids,
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

const updateJob = async (req, res) => {
  const { id } = req.params;
  let {
    name,
    description,
    type,
    gender,
    shift,
    location,
    notes,
    instructions,
    contactDetails,
    emergencyContact,
    documents,
  } = req.body;
  const timezone = req.user.timezone;
  if (shift && !Array.isArray(shift)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "shift_must_be_array",
    });
  }
  if (req.body.isBreak && !req.body.breakMin) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "breakMin_required_when_isBreak_true",
    });
  }
  let convertedJobs = undefined;
  if (shift && Array.isArray(shift)) {
    convertedJobs = shift.map((job) => {
      const startUtc = moment
        .tz(`${job.date} ${job.startTime}`, "YYYY-MM-DD HH:mm", timezone)
        .utc();

      const endUtc = moment
        .tz(`${job.date} ${job.endTime}`, "YYYY-MM-DD HH:mm", timezone)
        .utc();

      return {
        ...job,
        date: startUtc.format("YYYY-MM-DD"),
        startTime: startUtc.format("HH:mm"),
        endTime: endUtc.format("HH:mm"),
      };
    });
  }

  const user = req.user._id;
  let data = {
    user,
    name,
    description,
    type,
    gender,
    shift: convertedJobs || undefined,
    location,
    notes,
    instructions,
    contactDetails,
    emergencyContact,
    documents,
  };
  try {
    const updated = await JobService.updateJob(id, data);
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
        translationKey: "Job_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Job_updated_successfully",
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

const getJobDetails = async (req, res) => {
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
    const job = await JobService.getJobDetails(id, timezone);
    if (!job) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Job_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Job_fetched_successfully",
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
const deleteJob = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await JobService.deleteJob(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Job_not_found",
      });
    }
    if (Array.isArray(deleted.bidderIds) && deleted.bidderIds.length > 0) {
      void sendUserNotifications({
        recipientIds: deleted.bidderIds,

        title: "Job Cancelled",

        body: `The job "${deleted.name || "job"}" has been cancelled.`,

        data: {
          type: NotificationTypes.JOB_CANCELLED,
          objectType: "Job",
          jobId: id,
        },

        sender: req.user._id,

        objectId: id,

        saveNotification: true,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Job_deleted_successfully",
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
  createJob,
  getJobs,
  updateJob,
  deleteJob,
  getJobDetails,
  getJobBids,
  updateJobBids,
};
