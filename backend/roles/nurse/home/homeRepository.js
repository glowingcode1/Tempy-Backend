const moment = require("moment-timezone");

const Booking = require("../../careHome/booking/Booking");
const { User } = require("../../../models/UserModel");
const { formatUserResponse } = require("@helperUtils/userResponseUtil");
const {
  getShiftStartUtc,
  getShiftEndUtc,
  formatShiftToTimezone,
} = require("@helperUtils/responseUtil");
const { DEFAULT_CURRENCY } = require("@helperUtils/constants");
const {
  getEarningsSummary,
} = require("../../careHome/booking/earnings");
const {
  withUserReviews,
} = require("../../../commonModules/reviews/reviewRepository");

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

  // Overnight shift
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



/* =========================================================
   DATE HELPERS
========================================================= */

const getTodayRange = (timezone = "UTC") => {
  const now = moment.tz(timezone);

  return {
    start: now.clone().startOf("day").utc().toDate(),
    end: now.clone().add(1, "day").startOf("day").utc().toDate(),
  };
};

const getCurrentWeekRange = (timezone = "UTC") => {
  const now = moment.tz(timezone);

  const start = now.clone().startOf("isoWeek");
  const end = start.clone().add(1, "week");

  return {
    start: start.utc().toDate(),
    end: end.utc().toDate(),
  };
};

/* =========================================================
   BOOKING MATCH
========================================================= */

/**
 * Customer:
 *   Booking.employer = logged-in user
 *
 * Nurse:
 *   Booking.worker = logged-in user
 */
const getBookingUserMatch = ({ userId, userType }) => {
  if (userType === "nurse") {
    return {
      worker: userId,
    };
  }

  return {
    employer: userId,
  };
};

/* =========================================================
   EARNINGS
========================================================= */

/*
 * The home screen shows this month and this week; the shared summary builds
 * both, along with the running total the header shows beside them.
 */
const getEarnings = async ({ userId, timezone, userType }) => {
  const summary = await getEarningsSummary({
    userId,
    userType,
    timezone,
  });

  return {
    thisMonth: summary.thisMonth,
    thisWeek: summary.thisWeek,
    total: summary.total,
    upcoming: summary.upcoming,
    currency: summary.currency,
    symbol: summary.symbol,
    type: summary.type,
    ...(summary.agencySupplied
      ? { agencySupplied: summary.agencySupplied }
      : {}),
  };
};

/* =========================================================
   TODAY'S SHIFTS
========================================================= */

const getTodaysShifts = async ({ userId, timezone, userType }) => {
  const { start, end } = getTodayRange(timezone);

  const userMatch = getBookingUserMatch({
    userId,
    userType,
  });

  const bookings = await Booking.find({
    ...userMatch,

    "shift.date": {
      $gte: moment.utc(start).subtract(1, "day").toDate(),
      $lt: moment.utc(end).add(1, "day").toDate(),
    },

    status: {
      $nin: ["cancelledByWorker", "cancelledByEmployer", "cancelledByUser"],
    },
  })
    .sort({
      "shift.startTime": 1,
    })
    .populate({
      path: "worker",
      select: "name profileIcon gender",
    })
    .populate({
      path: "job",
      select: "name title",
    })
    .lean();

  return bookings.filter((booking) => {
    const shiftStart = getShiftStartUtc(booking.shift);
    return shiftStart?.isSameOrAfter(start) && shiftStart.isBefore(end);
  }).map((booking) => {
    const shift = booking.shift || {};
    const shiftStart = getShiftStartUtc(shift);
    const shiftEnd = getShiftEndUtc(shift);
    const localShift = formatShiftToTimezone(shift, timezone);

    const hours = calculateShiftHours(shift);

    const jobName =
      booking.job?.name || booking.job?.title || booking.snapshot?.name || "";

    const location = booking.snapshot?.location || null;

    return {
      id: booking._id,

      bookingId: booking._id,

      job: {
        id: booking.job?._id || booking.job || null,
        name: jobName,
      },

      location,

      worker: booking.worker
        ? {
            id: booking.worker._id,
            name: booking.worker.name || "",
            profileIcon: booking.worker.profileIcon || "",
            gender: booking.worker.gender || "",
          }
        : null,

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

      // totalAmount is the worker's net payout (bid minus the platform
      // fee), which is the right figure here; bid is the gross.
      payment: {
        perHour: booking.payment?.perHour || 0,
        bid: booking.payment?.amount || 0,
        totalAmount: booking.payment?.totalAmount || 0,
        currency: booking.payment?.currency || DEFAULT_CURRENCY,
      },
    };
  });
};

/* =========================================================
   WEEKLY HOURS
========================================================= */

const getWeeklyHours = async ({
  userId,
  timezone,
  userType,
  weeklyTargetHours,
}) => {
  const { start, end } = getCurrentWeekRange(timezone);

  const userMatch = getBookingUserMatch({
    userId,
    userType,
  });

  const bookings = await Booking.find({
    ...userMatch,

    "shift.date": {
      $gte: moment.utc(start).subtract(1, "day").toDate(),
      $lt: moment.utc(end).add(1, "day").toDate(),
    },

    status: {
      $nin: ["cancelledByWorker", "cancelledByEmployer", "cancelledByUser"],
    },
  })
    .select("shift status")
    .lean();

  let totalHours = 0;

  bookings.forEach((booking) => {
    const shiftStart = getShiftStartUtc(booking.shift);
    if (!shiftStart?.isSameOrAfter(start) || !shiftStart.isBefore(end)) return;
    totalHours += calculateShiftHours(booking.shift);
  });

  totalHours = Number(totalHours.toFixed(2));

  const targetHours =
    Number(weeklyTargetHours) > 0 ? Number(weeklyTargetHours) : 30;

  const percentage =
    targetHours > 0
      ? Number(Math.min((totalHours / targetHours) * 100, 100).toFixed(2))
      : 0;

  return {
    currentHours: totalHours,

    targetHours,

    remainingHours: Number(Math.max(targetHours - totalHours, 0).toFixed(2)),

    percentage,

    formatted: `${totalHours}/${targetHours} hr`,

    period: {
      start: moment.utc(start).tz(timezone).format("YYYY-MM-DD"),

      end: moment.utc(end).subtract(1, "day").tz(timezone).format("YYYY-MM-DD"),
    },

    bookingsCount: bookings.length,
  };
};

/* =========================================================
   MAIN HOME
========================================================= */

const getHomeData = async ({ userId, timezone, userType }) => {
  const user = await User.findById(userId).lean();

  if (!user) {
    const error = new Error("User_not_found");
    error.statusCode = 404;
    throw error;
  }

  const userTimezone = user.timezone || timezone || "UTC";

  const [earnings, todaysShifts, weeklyHours] = await Promise.all([
    getEarnings({
      userId,
      timezone: userTimezone,
      userType,
    }),

    getTodaysShifts({
      userId,
      timezone: userTimezone,
      userType,
    }),

    getWeeklyHours({
      userId,
      timezone: userTimezone,
      userType,
      weeklyTargetHours: user.weeklyHours,
    }),
  ]);

  /**
   * Use the same user response formatter used by
   * login/profile APIs.
   *
   * radius will automatically be included because
   * formatUserResponse() contains:
   *
   * radius: userObject.radius ?? 10
   */
  const formattedUser = formatUserResponse(
    await withUserReviews(user, { currentUserId: userId }),
  );

  return {
    user: formattedUser,

    earnings,

    todaysShifts: {
      date: moment.tz(userTimezone).format("YYYY-MM-DD"),

      count: todaysShifts.length,

      data: todaysShifts,
    },

    weeklyHours,
  };
};

module.exports = {
  getHomeData,
  getEarnings,
  getTodaysShifts,
  getWeeklyHours,
  calculateShiftHours,
};
