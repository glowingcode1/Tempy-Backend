const moment = require("moment-timezone");

const Booking = require("../../careHome/booking/Booking");
const { User } = require("../../../models/UserModel");

const Review = require("../../../commonModules/reviews/Review");
const { formatUserResponse } = require("@helperUtils/userResponseUtil");
const {
  getShiftStartUtc,
  getShiftEndUtc,
  formatShiftToTimezone,
} = require("@helperUtils/responseUtil");
const { DEFAULT_CURRENCY } = require("@helperUtils/constants");

/* =========================================================
   HELPERS
========================================================= */

const timeToMinutes = (time) => {
  if (!time || typeof time !== "string") {
    return null;
  }

  const [hours, minutes] = time.split(":").map(Number);

  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  return hours * 60 + minutes;
};

const calculateShiftHours = (shift) => {
  if (!shift) {
    return 0;
  }

  const startMinutes = timeToMinutes(shift.startTime);
  const endMinutes = timeToMinutes(shift.endTime);

  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  let durationMinutes = endMinutes - startMinutes;

  if (durationMinutes < 0) {
    durationMinutes += 24 * 60;
  }

  const breakMinutes = Number(shift.breakMin) || 0;

  durationMinutes = Math.max(0, durationMinutes - breakMinutes);

  return Number((durationMinutes / 60).toFixed(2));
};

const formatHours = (hours) => {
  if (!hours) {
    return "0 hr";
  }

  return `${Number(hours.toFixed(2))} hr`;
};



const getTodayRange = (timezone = "UTC") => {
  const now = moment.tz(timezone);

  return {
    start: now.clone().startOf("day").utc().toDate(),
    end: now.clone().add(1, "day").startOf("day").utc().toDate(),
  };
};

/* =========================================================
   WORKER RATINGS
========================================================= */

const getWorkerRatings = async (workerIds = []) => {
  if (!workerIds.length) {
    return {};
  }

  const stats = await Review.aggregate([
    {
      $match: {
        worker: { $in: workerIds },
      },
    },
    {
      $group: {
        _id: "$worker",
        avgRating: { $avg: "$rating" },
        reviewsCount: { $sum: 1 },
      },
    },
  ]);

  return stats.reduce((acc, s) => {
    acc[s._id.toString()] = {
      rating: Number((s.avgRating || 0).toFixed(1)),
      reviewsCount: s.reviewsCount || 0,
    };
    return acc;
  }, {});
};

/* =========================================================
   TODAY'S SHIFTS (customer view)
========================================================= */

const getTodaysShifts = async ({ userId, timezone }) => {
  const { start, end } = getTodayRange(timezone);

  const bookings = await Booking.find({
    // Customers (user, localAuthority, careHome, hospital) are matched
    // via Booking.user — set to bid.jobCreator at booking-creation time
    // (see bookingService.createBooking).
    //
    // Booking.employer is NOT the customer. It denormalizes the
    // staffing agency/company that owns the worker, only on the
    // agency-bid path, and is null on direct nurse bookings:
    //   employer: user.accountState.userType !== "nurse" ? bid.user : null
    // Never match customer bookings against it.
    user: userId,

    "shift.date": {
      $gte: moment.utc(start).subtract(1, "day").toDate(),
      $lt: moment.utc(end).add(1, "day").toDate(),
    },

    status: {
      $nin: ["cancelledByWorker", "cancelledByEmployer", "cancelledByUser"],
    },
  })
    .sort({ "shift.startTime": 1 })
    .populate({
      path: "worker",
      select: "name profileIcon gender",
    })
    .populate({
      path: "job",
      select: "name title",
    })
    .lean();

  const workerIds = bookings.map((b) => b.worker?._id).filter(Boolean);

  const ratingsMap = await getWorkerRatings(workerIds);

  return bookings.filter((booking) => {
    const shiftStart = getShiftStartUtc(booking.shift);
    return shiftStart?.isSameOrAfter(start) && shiftStart.isBefore(end);
  }).map((booking) => {
    const shift = booking.shift || {};
    const shiftStart = getShiftStartUtc(shift);
    const shiftEnd = getShiftEndUtc(shift);
    const localShift = formatShiftToTimezone(shift, timezone);
    const hours = calculateShiftHours(shift);

    const jobRoleName =
      booking.job?.name || booking.job?.title || booking.snapshot?.name || "";

    const workerId = booking.worker?._id?.toString();
    const ratingInfo = ratingsMap[workerId] || { rating: 0, reviewsCount: 0 };

    // Snapshot location captured at approval time.
    const location = booking.snapshot?.location || null;

    return {
      id: booking._id,
      bookingId: booking._id,

      job: {
        id: booking.job?._id || booking.job || null,
        roleName: jobRoleName,
      },

      worker: booking.worker
        ? {
            id: booking.worker._id,
            name: booking.worker.name || "",
            profileIcon: booking.worker.profileIcon || "",
            gender: booking.worker.gender || "",
            rating: ratingInfo.rating,
            reviewsCount: ratingInfo.reviewsCount,
          }
        : null,

      location,

      shift: {
        id: shift._id,
        date: localShift.date,
        startTime: localShift.startTime,
        endTime: shiftEnd ? localShift.endTime : "",
        breakMin: shift.breakMin || 0,
        totalHours: hours,
        formattedHours: formatHours(hours),
      },

      status: booking.status,

      attendance: {
        checkIn: booking.attendance?.checkIn || null,
        checkOut: booking.attendance?.checkOut || null,
      },

      // payment.amount is the approved bid — what the customer owes.
      // payment.totalAmount is the worker's net (bid minus the platform fee),
      // so it must not be surfaced on a customer screen.
      payment: {
        perHour: booking.payment?.perHour || 0,
        bid: booking.payment?.amount || 0,
        totalAmount: booking.payment?.amount || 0,
        currency: booking.payment?.currency || DEFAULT_CURRENCY,
      },

      createdAt: booking.createdAt,
    };
  });
};

/* =========================================================
   MAIN HOME
========================================================= */

const getHomeData = async ({ userId, timezone }) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    const error = new Error("User_not_found");
    error.statusCode = 404;
    throw error;
  }

  const userTimezone = user.timezone || timezone || "UTC";

  const todaysShifts = await getTodaysShifts({
    userId,
    timezone: userTimezone,
  });

  const formattedUser = formatUserResponse(user);

  return {
    user: formattedUser,

    todaysShifts: {
      date: moment.tz(userTimezone).format("YYYY-MM-DD"),
      count: todaysShifts.length,
      data: todaysShifts,
    },
  };
};

module.exports = {
  getHomeData,
  getTodaysShifts,
  getWorkerRatings,
  calculateShiftHours,
};
