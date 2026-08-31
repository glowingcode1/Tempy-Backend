const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const moment = require("moment");
const StaffService = require("./staffService");
const { customerTypes, supplierTypes } = require("@UsersModel");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");

const getAllNurses = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status } = req.query;

  try {
    const timezone = req.user.timezone;
    const { staff, meta } = await StaffService.getAllNurses({
      timezone,
      page,
      limit,
      keyword,
      status,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Staff_fetched_successfully",
      data: staff,
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

const createStaff = async (req, res) => {
  let {
    speciality,
    ratePerHour,
    platformPercent,
    email,
    staff,
    name,
    phoneNumber,
    dob,
    gender,
    branch,
    location,
  } = req.body;
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
  if (staff) {
    if (
      !validateParams(req, res, {
        rawData: ["speciality", "ratePerHour", "platformPercent", "branch"],
      })
    )
      return;
  } else {
    if (
      !validateParams(req, res, {
        rawData: [
          "speciality",
          "ratePerHour",
          "platformPercent",
          "email",
          "name",
          "phoneNumber",
          "dob",
          "gender",
        ],
      })
    )
      return;
  }

  let data = {
    user,
    speciality,
    ratePerHour,
    platformPercent,
    email,
    staff: staff || undefined,
    name: name || undefined,
    phoneNumber: phoneNumber || undefined,
    dob: dob || undefined,
    gender: gender || undefined,
    branch,
    location,
  };
  try {
    const Staff = await StaffService.createStaff(data, req, res);
    if (!Staff) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Staff_creation_failed",
      });
    }
    if (Staff && Staff.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: Staff.error,
      });
    }

    if (staff) {
      const nurseId = Staff.staff?._id || Staff.staff || staff;

      if (nurseId) {
        void sendUserNotifications({
          recipientIds: [nurseId],

          title: "New Staff Request",

          body: `You have received a new staff request from ${req.user.name || "a customer"}.`,

          data: {
            type: NotificationTypes.NEW_BOOKING,
            objectType: "Staff",
          },

          sender: req.user._id,

          objectId: Staff._id,

          saveNotification: true,
        });
      }
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Staff_created_successfully",
      data: Staff,
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

const getStaff = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, user, bid } = req.query;

  let customer = await customerTypes.includes(req.user.userType);
  let supplier = await supplierTypes.includes(req.user.userType);
  if (user) {
    ((customer = null), (supplier = null));
  } else {
    if (customer) {
      user = req.user._id;
    }

    if (supplier) {
      user = req.user._id;
    }
  }

  try {
    const timezone = req.user.timezone;
    const { staff, meta } = await StaffService.getStaff({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      customer,
      bid,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Staff_fetched_successfully",
      data: staff,
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
const updateStaff = async (req, res) => {
  const { id } = req.params;
  let {
    name,
    phoneNumber,
    dob,
    gender,
    speciality,
    ratePerHour,
    platformPercent,
    status,
  } = req.body;
  const isAgency = req.user.userType === "agency";
  const allowedStatusesAgency = ["active", "left"];

  if (isAgency && status && allowedStatusesAgency.includes(status)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "the_status_is_not_allowed_for_agency",
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
    name,
    phoneNumber,
    dob,
    gender,
    speciality,
    ratePerHour,
    platformPercent,
    status,
    user,
  };
  try {
    const updated = await StaffService.updateStaff(id, data);
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
        translationKey: "Staff_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Staff_updated_successfully",
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

const getStaffDetails = async (req, res) => {
  const { id } = req.params;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  const user = req.user._id;
  const customer = await customerTypes.includes(req.user.userType);
  const supplier = await supplierTypes.includes(req.user.userType);
  try {
    const { formatted, error } = await StaffService.getStaffDetails(
      id,
      user,
      timezone,
      customer,
      supplier,
    );
    if (error) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: error,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Staff_fetched_successfully",
      data: formatted,
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
const deleteStaff = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await StaffService.deleteStaff(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Staff_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Staff_deleted_successfully",
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

const getAvailableStaff = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { bid, job } = req.query;
  if (!bid || !job) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "bid_and_job_required",
    });
  }

  try {
    const timezone = req.user.timezone;
    const user = req.user._id;
    const { staff, meta, error } = await StaffService.getAvailableStaff({
      timezone,
      page,
      limit,
      user,
      bid,
      job,
    });
    if (error) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: error,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Staff_fetched_successfully",
      data: staff,
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

const respondToStaffRequest = async (req, res) => {
  const { id } = req.params;
  const { action } = req.body;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) {
    return;
  }

  if (!["accept", "reject"].includes(action)) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_staff_request_action",
    });
  }

  const nurseId = req.user._id;

  try {
    const result = await StaffService.respondToStaffRequest({
      staffRecordId: id,
      nurseId,
      action,
    });

    if (result?.error) {
      return sendResponse({
        res,
        statusCode: result.statusCode || 400,
        translationKey: result.error,
      });
    }
    const requesterId =
      result.user || result.requester || result.createdBy || result.employer;

    if (requesterId) {
      const isAccepted = action === "accept";

      void sendUserNotifications({
        recipientIds: [requesterId],

        title: isAccepted ? "Staff Request Accepted" : "Staff Request Rejected",

        body: isAccepted
          ? `${req.user.name || "The nurse"} has accepted your staff request.`
          : `${req.user.name || "The nurse"} has rejected your staff request.`,

        data: {
          type: isAccepted
            ? NotificationTypes.STAFF_REQUEST_ACCEPTED
            : NotificationTypes.STAFF_REQUEST_REJECTED,

          objectType: "Staff",
        },

        sender: nurseId,

        objectId: result._id || id,

        saveNotification: true,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey:
        action === "accept"
          ? "staff_request_accepted_successfully"
          : "staff_request_rejected_successfully",
      data: result,
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

const getMyStaffRequests = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);

  try {
    const { requests, meta } = await StaffService.getMyStaffRequests({
      nurseId: req.user._id,
      page,
      limit,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "staff_requests_fetched_successfully",
      data: requests,
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

module.exports = {
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
  getStaffDetails,
  getAllNurses,
  getAvailableStaff,
  respondToStaffRequest,
  getMyStaffRequests,
};
