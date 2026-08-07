const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const mongoose = require("mongoose");
const moment = require("moment");
const BookingService = require("./bookingService");
const { customerTypes, supplierTypes } = require("@UsersModel");

const createBooking = async (req, res) => {
  let { bid, worker } = req.body;
  if (
    !validateParams(req, res, {
      rawData: ["bid"],
    })
  )
    return;
  let data = {
    bid,
    worker: worker || null,
    createdByUserType: req.user?.userType || null,
    createdByUserId: req.user?._id || null,
  };
  try {
    const Booking = await BookingService.createBooking(data);
    if (!Booking) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Booking_creation_failed",
      });
    }
    if (Booking && Booking.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: Booking.error,
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Booking_created_successfully",
      data: Booking,
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

const getBooking = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, user, latitude, longitude, km } = req.query;

  const customer = customerTypes.includes(req.user.userType);
  const supplier = supplierTypes.includes(req.user.userType);
  const isNurse = req.user.userType === "nurse";
  let worker,
    employer = null;
  if (customer) {
    user = req.user._id;
  }
  if (supplier) {
    if (isNurse) {
      worker = req.user._id;
    } else {
      employer = req.user._id;
    }
  }

  const geoProvided = [latitude, longitude, km].filter(
    (v) => v !== undefined && v !== null && v !== "",
  );

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
    const { Booking, meta } = await BookingService.getBooking({
      timezone,
      page,
      limit,
      keyword,
      status,
      user,
      worker,
      employer,
      latitude,
      longitude,
      km,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Booking_fetched_successfully",
      data: Booking,
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
const updateBooking = async (req, res) => {
  const { id } = req.params;
  const { checkinCheckout } = req.query;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  if (checkinCheckout) {
    const isNurse = req.user.userType === "nurse";
    const allowedStatuses = ["checkin", "checkout"];
    const { status, location, proofPicture, signature } = req.body;
    if (!isNurse) {
      return sendResponse({
        res,
        statusCode: 403,
        translationKey: "only_nurse_can_checkin_checkout",
      });
    }
    if (!status || !allowedStatuses.includes(status)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "invalid_status_for_checkin_checkout",
      });
    }
    if (!location) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "location_required_for_checkin_checkout",
      });
    }
    if (status === "checkin" && (!proofPicture || !signature)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "proofPicture_and_signature_required_for_checkin",
      });
    }
    try {
      const updated = await BookingService.updateBookingCheckinCheckout(id, {
        status,
        location,
        proofPicture,
        signature,
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
          translationKey: "Booking_not_found",
        });
      }

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "Booking_updated_successfully",
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
  } else {
    let { status } = req.body;
    const customer = await customerTypes.includes(req.user.userType);
    const supplier = await supplierTypes.includes(req.user.userType);
    const userType = req.user.userType;
    const allowedStatuses = ["active", "cancel"];

    if (status && !allowedStatuses.includes(status)) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "the_status_is_not_allowed",
      });
    }

    const currentUser = req.user._id;

    let data = {
      currentUser,
      status,
      userType,
      customer,
      supplier,
    };
    try {
      const updated = await BookingService.updateBooking(id, data);
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
          translationKey: "Booking_not_found",
        });
      }

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "Booking_updated_successfully",
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
  }
};

const getBookingDetails = async (req, res) => {
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
    const job = await BookingService.getBookingDetails(id, timezone);
    if (!job) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Booking_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Booking_fetched_successfully",
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
const deleteBooking = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await BookingService.deleteBooking(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Booking_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Booking_deleted_successfully",
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
const getBookingCalender = async (req, res) => {
  let { latitude, longitude, startDate, endDate, branch } = req.query;

  if (
    !validateParams(req, res, {
      queryParams: ["latitude", "longitude", "startDate", "endDate"],
    })
  )
    return;
  const lat = parseFloat(latitude);
  if (Number.isNaN(lat) || lat < -90 || lat > 90) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_latitude",
    });
  }
  const lon = parseFloat(longitude);
  if (Number.isNaN(lon) || lon < -180 || lon > 180) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_longitude",
    });
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "invalid_date_format",
    });
  }
  if (start > end) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "start_date_must_be_before_end_date",
    });
  }

  try {
    const timezone = req.user.timezone;
    const user = req.user._id;
    const customer = await customerTypes.includes(req.user.userType);
    const userType = req.user.userType;
    const supplier = await supplierTypes.includes(req.user.userType);
    const { calendar, meta } = await BookingService.getBookingCalendar({
      customer,
      supplier,
      timezone,
      latitude: lat,
      longitude: lon,
      startDate: start,
      endDate: end,
      user,
      customer,
      supplier,
      branch,
      userType,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Booking_fetched_successfully",
      data: calendar,
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
const getBookingCheckInLogs = async (req, res) => {
  const { bookingId } = req.params;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      pathParams: ["bookingId"],
      objectIdFields: ["bookingId"],
    })
  )
    return;

  try {
    const logs = await BookingService.getBookingCheckInLogs(
      bookingId,
      timezone,
    );
    if (!logs) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Booking_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Booking_checkin_logs_fetched_successfully",
      data: logs,
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

const getShiftPlanCalendar = async (req, res) => {
  const { year, month } = req.query;

  const y = Number(year);
  const m = Number(month);

  if (
    !year ||
    !month ||
    !Number.isInteger(y) ||
    !Number.isInteger(m) ||
    m < 1 ||
    m > 12
  ) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "valid_year_and_month_are_required",
    });
  }

  try {
    const timezone = req.user.timezone;
    const data = await BookingService.getShiftPlanCalendar({
      year: y,
      month: m,
      timezone,
      user: req.user._id,
      userType: req.user.userType,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Booking_fetched_successfully",
      data,
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

const getEarnings = async (req, res) => {
  try {
    const data = await BookingService.getEarnings({
      userId: req.user._id,
      userType: req.user.userType,
      from: req.query.from,
      to: req.query.to,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Earnings_fetched_successfully",
      data,
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
  createBooking,
  getBooking,
  updateBooking,
  deleteBooking,
  getBookingDetails,
  getBookingCalender,
  getBookingCheckInLogs,
  getShiftPlanCalendar,
  getEarnings,
};
