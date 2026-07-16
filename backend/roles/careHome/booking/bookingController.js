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
  let { keyword, status, user } = req.query;

  const isAgency = req.user.userType === "agency";
  const isEmployee = req.user.userType === "employee";
  const isCareHome = req.user.userType === "careHome";
  if (isAgency || isEmployee) {
    user = req.user._id;
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
  let { shift, job, Booking, note, status } = req.body;
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
    Booking,
    note,
    status,
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
  let { latitude, longitude, startDate, endDate, brach } = req.query;

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
    const supplier = await supplierTypes.includes(req.user.userType);
    const { calendar, meta } = await BookingService.getBookingCalender({
      timezone,
      latitude: lat,
      longitude: lon,
      startDate: start,
      endDate: end,
      user,
      customer,
      supplier,
      brach,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Booking_fetched_successfully",
      data: calendar,
      meta
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
};
