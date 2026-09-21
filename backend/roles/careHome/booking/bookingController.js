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
const {
  findUserById,
} = require("../../../roles/admin/usersManagement/usersRepository");
const { sendUserNotifications } = require("@notificationsUtil");
const { NotificationTypes } = require("@NotificationsModel");

const createBooking = async (req, res) => {
  let { bid, worker } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["bid"],
    })
  ) {
    return;
  }

  /*
   * If the logged-in user is a nurse, the nurse
   * automatically becomes the worker.
   *
   * This is mainly useful for agency-created bookings
   * where the nurse is assigning/responding.
   */
  if (req.user?.userType === "nurse") {
    worker = req.user._id;
  }

  const data = {
    bid,

    worker: worker || null,

    createdByUserType: req.user?.userType || null,

    createdByUserId: req.user?._id || null,
  };

  try {
    const booking = await BookingService.createBooking(data);

    if (!booking) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Booking_creation_failed",
      });
    }

    if (booking.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: booking.error,
      });
    }

    const workerId = booking.worker?._id || booking.worker || null;

    const jobName = booking.job?.name || booking.jobName || "your job";

    /*
     * =========================================================
     * DIRECT NURSE BOOKING
     * =========================================================
     *
     * Nurse bid was accepted by care home.
     *
     * Booking is already active.
     *
     * Notify the nurse that the bid was accepted.
     */
    if (
      workerId &&
      booking.status === "active" &&
      String(workerId) !== String(req.user._id)
    ) {
      void sendUserNotifications({
        recipientIds: [workerId],

        title: "Booking Confirmed",

        body: `Your bid for ${jobName} has been accepted. Your booking is confirmed.`,

        data: {
          type: NotificationTypes.BOOKING,
          objectType: "Booking",
          jobId: booking.job?._id || booking.job,
        },

        sender: req.user._id,

        objectId: booking._id,

        saveNotification: true,
      });
    }

    /*
     * =========================================================
     * AGENCY ASSIGNED WORKER
     * =========================================================
     *
     * Agency created booking for a worker.
     *
     * Booking remains pending until worker accepts.
     */
    if (
      workerId &&
      booking.status === "pending" &&
      String(workerId) !== String(req.user._id)
    ) {
      void sendUserNotifications({
        recipientIds: [workerId],

        title: "New Job Offer",

        body: `You've been assigned to ${jobName}. Please accept or decline this offer.`,

        data: {
          type: NotificationTypes.JOB_ASSIGNED,
          objectType: "Booking",
          jobId: booking.job?._id || booking.job,
        },

        sender: req.user._id,

        objectId: booking._id,

        saveNotification: true,
      });
    }

    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Booking_created_successfully",
      data: booking,
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
      currentUserId: req.user._id,
      customer,
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
    /*
     * checkOutProof is the late hand-in of the picture and signature for a
     * shift the auto-checkout sweep closed, so it needs neither a status
     * change nor a location — the shift is already over.
     */
    const allowedStatuses = ["checkin", "checkout", "checkOutProof"];
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
    if (status !== "checkOutProof" && !location) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "location_required_for_checkin_checkout",
      });
    }
    if (!proofPicture || !signature) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey:
          status === "checkin"
            ? "proofPicture_and_signature_required_for_checkin"
            : "proofPicture_and_signature_required_for_checkout",
      });
    }
    try {
      const updated =
        status === "checkOutProof"
          ? await BookingService.submitCheckOutProof(id, {
              workerId: req.user._id,
              proofPicture,
              signature,
            })
          : await BookingService.updateBookingCheckinCheckout(id, {
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
          /*
           * Carries the shift that is in the way, so the app can send the
           * worker straight to it instead of making them hunt for it.
           */
          data: updated.data,
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

      if (updated.status === "active") {
        // nurse accepted the offer
        const recipients = [updated.user, updated.employer].filter(
          (r) => r && String(r) !== String(req.user._id),
        );
        if (recipients.length) {
          void sendUserNotifications({
            recipientIds: recipients,
            title: "Booking Confirmed",
            body: "The worker has accepted the shift and the booking is confirmed.",
            data: {
              type: NotificationTypes.BOOKING,
              objectType: "Booking",
              jobId: updated.job,
            },
            sender: req.user._id,
            objectId: updated._id,
            saveNotification: true,
          });
        }
      } else if (updated.status === "cancelledByWorker") {
        // nurse rejected — only the agency that assigned it needs to know
        if (updated.employer) {
          void sendUserNotifications({
            recipientIds: [updated.employer],
            title: "Worker Declined",
            body: "The assigned worker declined this shift. Please assign someone else.",
            data: {
              type: NotificationTypes.BOOKING,
              objectType: "Booking",
              jobId: updated.job,
            },
            sender: req.user._id,
            objectId: updated._id,
            saveNotification: true,
          });
        }
      }

      return sendResponse({
        res,
        statusCode: 200,
        translationKey: "Booking_updated_successfully",
        // `strike` is set when this cancellation counted under the three
        // strikes rule: { strikes, limit, suspended }.
        data: {
          ...(updated.toObject ? updated.toObject() : updated),
          strike: updated.strike || null,
        },
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
    const job = await BookingService.getBookingDetails(
      id,
      timezone,
      req.user._id,
      customerTypes.includes(req.user.userType),
      req.user.userType === "admin",
    );
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
    let timezone = req.user.timezone;
    const targetUserId = req.query.user || req.query.userId || req.user._id;
    let user = targetUserId;
    let userType = req.user.userType;

    if (req.query.user || req.query.userId) {
      const targetUser = await findUserById(targetUserId);
      if (!targetUser) {
        return sendResponse({
          res,
          statusCode: 404,
          translationKey: "User_not_found",
        });
      }
      userType = targetUser.accountState?.userType || targetUser.userType;
      timezone = targetUser.timezone || timezone;
    }

    const customer = customerTypes.includes(userType);
    const supplier = supplierTypes.includes(userType);
    const { calendar, meta } = await BookingService.getBookingCalendar({
      customer,
      supplier,
      timezone,
      latitude: lat,
      longitude: lon,
      startDate: start,
      endDate: end,
      user,
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
      req.user._id,
      req.user.userType === "admin",
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
      translationKey: "Shift_Plans_fetched_successfully",
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
