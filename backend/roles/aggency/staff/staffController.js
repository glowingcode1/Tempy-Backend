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
        rawData: ["speciality", "ratePerHour", "platformPercent"],
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
  let { keyword, status, user } = req.query;

  const customer = await customerTypes.includes(req.user.userType);
  const supplier = await supplierTypes.includes(req.user.userType);
  if (customer) {
    user = req.user._id;
  }

  if (supplier) {
    user = req.user._id;
  }
  console.log("user", user);
  try {
    const timezone = req.user.timezone  ;
    const { staff, meta } = await StaffService.getStaff({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      customer,
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
  try {
    const staff = await StaffService.getStaffDetails(id, user, timezone);
    if (!staff) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Staff_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Staff_fetched_successfully",
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
module.exports = {
  createStaff,
  getStaff,
  updateStaff,
  deleteStaff,
  getStaffDetails,
  getAllNurses,
};
