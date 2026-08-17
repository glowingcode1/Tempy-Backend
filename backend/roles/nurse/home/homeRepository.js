const moment = require("moment-timezone");

const Booking = require("../../careHome/booking/Booking");
const { User } = require("../../../models/UserModel");

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

const getEarnings = async ({ userId, timezone, userType }) => {
  const now = moment.tz(timezone);

  const monthStart = now.clone().startOf("month");
  const weekStart = now.clone().startOf("isoWeek");

  return {
    // available: false,

    // currency: "USD",

    thisMonth: {
      amount: 0,
      formatted: "$0",
      period: monthStart.format("MMMM YYYY"),
    },

    thisWeek: {
      amount: 0,
      formatted: "$0",
      period: `${weekStart.format("DD MMM")} - ${now.format("DD MMM")}`,
    },

    monthGrowth: {
      percentage: 0,
      available: false,
    },

    weekGrowth: {
      percentage: 0,
      available: false,
    },
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
      $gte: start,
      $lt: end,
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

  return bookings.map((booking) => {
    const shift = booking.shift || {};

    const hours = calculateShiftHours(shift);

    /**
     * Job name:
     *
     * Prefer populated Job.
     * If Job isn't populated, use booking.snapshot.name.
     */
    const jobName =
      booking.job?.name || booking.job?.title || booking.snapshot?.name || "";

    return {
      id: booking._id,

      bookingId: booking._id,

      job: {
        id: booking.job?._id || booking.job || null,
        name: jobName,
      },

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

        date: shift.date,

        startTime: shift.startTime || "",

        endTime: shift.endTime || "",

        breakMin: shift.breakMin || 0,

        totalHours: hours,

        formattedHours: formatHours(hours),
      },

      status: booking.status,

      attendance: {
        checkIn: booking.attendance?.checkIn || null,
        checkOut: booking.attendance?.checkOut || null,
      },

      payment: {
        perHour: booking.payment?.perHour || 0,
        currency: booking.payment?.currency || "USD",
      },

      createdAt: booking.createdAt,
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
      $gte: start,
      $lt: end,
    },

    status: {
      $nin: ["cancelledByWorker", "cancelledByEmployer", "cancelledByUser"],
    },
  })
    .select("shift status")
    .lean();

  let totalHours = 0;

  bookings.forEach((booking) => {
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
  const user = await User.findById(userId)
    .select("name profileIcon timezone weeklyHours")
    .lean();

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

  return {
    user: {
      id: user._id,
      name: user.name || "",
      profileIcon: user.profileIcon || "",
      timezone: userTimezone,
    },

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
