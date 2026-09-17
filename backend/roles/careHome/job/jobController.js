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
const {
  findUsableBranch,
} = require("../../aggency/branches/branchesRepository");
const { findUsableAddress } = require("../../nurse/address/addressRepository");
const {
  findUserById,
} = require("../../admin/usersManagement/usersRepository");
const { NotificationTypes } = require("@NotificationsModel");
// const { isUserProfileComplete } = require("@helperUtils/userResponseUtil");

const fileNameFromUrl = (url) => {
  const last = String(url).split("?")[0].split("/").pop() || "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};


/*
 * Job documents are stored as { name, url }. Clients send objects, bare URL
 * strings, or - from multipart forms - a JSON string of either.
 * Returns undefined when nothing was sent, null when the input is unusable.
 */
const normalizeDocuments = (documents) => {
  if (documents === undefined || documents === null || documents === "") {
    return undefined;
  }

  let list = documents;
  if (typeof list === "string") {
    try {
      list = JSON.parse(list);
    } catch {
      list = [list];
    }
  }
  if (!Array.isArray(list)) list = [list];

  const normalized = [];
  for (const doc of list) {
    if (typeof doc === "string" && doc.trim()) {
      normalized.push({
        name: fileNameFromUrl(doc),
        url: doc.trim(),
      });
    } else if (doc && typeof doc === "object" && typeof doc.url === "string") {
      normalized.push({
        name: typeof doc.name === "string" ? doc.name : "",
        url: doc.url,
      });
    } else {
      return null;
    }
  }
  return normalized;
};

/*
 * The contact blocks may also arrive flat (contactName, emergencyPhone, ...)
 * as the job form sends them. Nested objects win when both are present.
 */
const readContactFields = (body) => {
  const pick = (nested, fields) => {
    if (nested !== undefined) return nested;
    const entries = Object.entries(fields).filter(
      ([, key]) => body[key] !== undefined,
    );
    if (!entries.length) return undefined;
    return Object.fromEntries(entries.map(([field, key]) => [field, body[key]]));
  };

  return {
    contactDetails: pick(body.contactDetails, {
      name: "contactName",
      phone: "contactPhone",
      email: "contactEmail",
    }),
    emergencyContact: pick(body.emergencyContact, {
      name: "emergencyName",
      phone: "emergencyPhone",
      relationship: "emergencyRelation",
    }),
    notes: body.notes !== undefined ? body.notes : body.careNotes,
  };
};

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

  const sentDocuments = normalizeDocuments(documents);
  if (sentDocuments === null) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_documents",
    });
  }

  const uploadedDocuments = (req.files || []).map((file) => ({
    name: file.originalname || "",
    url: file.location || file.path,
  }));

  ({ contactDetails, emergencyContact, notes } = readContactFields(req.body));

  /*
   * The branch id comes straight from the request body, so it has to be
   * proved: the caller's own, and verified. An unverified branch cannot be
   * used, and until now any branch id at all was accepted.
   */
  /*
   * Individual users have saved addresses, not branches. Their apps send the
   * address id (as `address`, or in `branch` like the other customers), so it
   * is checked against their addresses and stored as the job's address.
   */
  let jobOwnerType = req.user.userType;
  if (jobOwnerType === "admin") {
    const owner = await findUserById(user);
    jobOwnerType = owner?.accountState?.userType || owner?.userType;
  }

  let address = null;

  if (jobOwnerType === "user") {
    const addressId = req.body.address || branch;
    branch = undefined;

    if (addressId) {
      const usableAddress = await findUsableAddress(addressId, user);

      if (!usableAddress) {
        return sendResponse({
          res,
          statusCode: 403,
          translationKey: "address_not_available",
        });
      }
      address = usableAddress._id;
    }
  }

  if (branch) {
    const usableBranch = await findUsableBranch(branch, user);

    if (!usableBranch) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "branch_not_available_or_not_verified",
      });
    }
  }

  let data = {
    name,
    description,
    type,
    gender,
    shift: convertedJobs,
    user,
    location,
    branch,
    address,
    image,
    worker,
    employer,
    notes,
    instructions,
    contactDetails,
    emergencyContact,
    documents: [...(sentDocuments || []), ...uploadedDocuments],
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
  let convertedJobs = undefined;
  if (shift && Array.isArray(shift)) {
    /*
     * Shifts are matched to the stored ones by _id (see JobService.updateJob).
     * Timing is converted only when the whole of it is sent: a shift sent
     * with just its _id and, say, isBiddingAllowed must not pick up an
     * "Invalid date". Dates may come back as the full ISO string the API
     * returns, so only the local calendar day is used.
     */
    for (const job of shift) {
      const hasTiming = job.date || job.startTime || job.endTime;
      if (hasTiming && !(job.date && job.startTime && job.endTime)) {
        return sendResponse({
          res,
          statusCode: 400,
          translationKey: "invalid_shift_date_or_time",
        });
      }
    }

    convertedJobs = shift.map((job) => {
      if (!job.date) return job;

      const day = String(job.date).slice(0, 10);
      const startUtc = moment.tz(
        `${day} ${job.startTime}`,
        "YYYY-MM-DD HH:mm",
        true,
        timezone,
      );
      const endUtc = moment.tz(
        `${day} ${job.endTime}`,
        "YYYY-MM-DD HH:mm",
        true,
        timezone,
      );

      if (!startUtc.isValid() || !endUtc.isValid()) {
        return { ...job, date: null };
      }

      return {
        ...job,
        date: startUtc.utc().format("YYYY-MM-DD"),
        startTime: startUtc.utc().format("HH:mm"),
        endTime: endUtc.utc().format("HH:mm"),
      };
    });

    if (convertedJobs.some((job) => job.date === null)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_shift_date_or_time",
      });
    }
  }

  const sentDocuments = normalizeDocuments(documents);
  if (sentDocuments === null) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_documents",
    });
  }

  ({ contactDetails, emergencyContact, notes } = readContactFields(req.body));

  let data = {
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
    documents: sentDocuments,
  };
  try {
    const updated = await JobService.updateJob(id, data, {
      requesterId: req.user._id,
      isAdmin: req.user.userType === "admin",
      timezone,
    });
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
    const deleted = await JobService.deleteJob(id, {
      requesterId: req.user._id,
      isAdmin: req.user.userType === "admin",
    });
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Job_not_found",
      });
    }
    if (deleted.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: deleted.error,
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
