const moment = require("moment-timezone");

const Booking = require("../../careHome/booking/Booking");
const { User } = require("../../../models/UserModel");

/* =========================================================
   CONSTANTS
========================================================= */

const CANCELLED_BOOKING_STATUSES = [
  "cancelledByWorker",
  "cancelledByEmployer",
  "cancelledByUser",
];

/* =========================================================
   HELPERS
========================================================= */

/**
 * Convert HH:mm into minutes.
 *
 * Example:
 * "08:30" -> 510
 * "14:00" -> 840
 */
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

/**
 * Calculate shift duration in hours.
 *
 * Handles:
 * - normal shifts
 * - overnight shifts
 * - breaks
 */
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

/**
 * Format hours for API response.
 */
const formatHours = (hours) => {
  if (!hours) {
    return "0 hr";
  }

  return `${Number(hours.toFixed(2))} hr`;
};

/**
 * Return the booking match for the logged-in user.
 *
 * Customer / company:
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

  /*
   * Earnings calculation can be connected to the actual
   * payment records when payment processing is implemented.
   *
   * For now the structure follows the dashboard design:
   *
   * earnings:
   *   thisMonth
   *   thisWeek
   */

  return {
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
  };
};

/* =========================================================
   PERFORMANCE GRAPH
========================================================= */

/**
 * Get the last 12 calendar months.
 *
 * Example if current month is August 2026:
 *
 * Sep 2025
 * Oct 2025
 * Nov 2025
 * Dec 2025
 * Jan 2026
 * Feb 2026
 * Mar 2026
 * Apr 2026
 * May 2026
 * Jun 2026
 * Jul 2026
 * Aug 2026
 */
const getLast12Months = (timezone = "UTC") => {
  const now = moment.tz(timezone);

  const currentMonth = now.clone().startOf("month");

  const months = [];

  for (let i = 11; i >= 0; i -= 1) {
    const month = currentMonth.clone().subtract(i, "months");

    months.push({
      key: month.format("YYYY-MM"),

      label: month.format("MMM"),

      month: month.format("MMMM"),

      year: month.year(),

      start: month.clone().startOf("month"),

      end: month.clone().add(1, "month").startOf("month"),
    });
  }

  return months;
};

/**
 * Get shifts + staff hours for the last 12 months.
 *
 * Graph:
 *
 *     Shifts
 *     Staff Hours
 *
 * Each booking represents one shift.
 *
 * staffHours is calculated from:
 * shift.startTime
 * shift.endTime
 * shift.breakMin
 */
const getPerformanceGraph = async ({ userId, timezone, userType }) => {
  const months = getLast12Months(timezone);

  const firstMonth = months[0];
  const lastMonth = months[months.length - 1];

  const rangeStart = firstMonth.start.clone().utc().toDate();

  const rangeEnd = lastMonth.end.clone().utc().toDate();

  const userMatch = getBookingUserMatch({
    userId,
    userType,
  });

  const bookings = await Booking.find({
    ...userMatch,

    "shift.date": {
      $gte: rangeStart,
      $lt: rangeEnd,
    },

    status: {
      $nin: CANCELLED_BOOKING_STATUSES,
    },
  })
    .select("_id worker shift status")
    .lean();

  /*
   * Prepare all months first.
   *
   * This guarantees that months with no activity
   * still appear in the graph with value 0.
   */
  const monthlyData = {};

  months.forEach((month) => {
    monthlyData[month.key] = {
      month: month.label,
      fullMonth: month.month,
      year: month.year,

      shifts: 0,

      staffHours: 0,

      staffCount: 0,

      _staffIds: new Set(),
    };
  });

  /*
   * Put each booking into its month.
   */
  bookings.forEach((booking) => {
    const shift = booking.shift;

    if (!shift?.date) {
      return;
    }

    const shiftDate = moment.utc(shift.date).tz(timezone);

    const monthKey = shiftDate.format("YYYY-MM");

    const monthData = monthlyData[monthKey];

    if (!monthData) {
      return;
    }

    /*
     * One booking = one shift.
     */
    monthData.shifts += 1;

    /*
     * Calculate staff hours from the shift.
     */
    const hours = calculateShiftHours(shift);

    monthData.staffHours += hours;

    /*
     * Track unique staff members who worked
     * during this month.
     *
     * This is useful metadata for the frontend,
     * although the graph itself uses staffHours.
     */
    if (booking.worker) {
      monthData._staffIds.add(String(booking.worker));
    }
  });

  /*
   * Convert internal structure into API response.
   */
  const data = months.map((month) => {
    const item = monthlyData[month.key];

    const staffHours = Number(item.staffHours.toFixed(2));

    return {
      month: item.month,

      fullMonth: item.fullMonth,

      year: item.year,

      shifts: item.shifts,

      staffHours,

      staffCount: item._staffIds.size,
    };
  });

  /*
   * Calculate totals.
   */
  const totalShifts = data.reduce((total, item) => total + item.shifts, 0);

  const totalStaffHours = Number(
    data.reduce((total, item) => total + item.staffHours, 0).toFixed(2),
  );

  /*
   * Frontend can directly use these two series
   * for the line chart.
   */
  const series = [
    {
      key: "shifts",
      label: "Shifts",
      data: data.map((item) => ({
        label: item.month,
        value: item.shifts,
      })),
    },

    {
      key: "staffHours",
      label: "Staff Hours",
      data: data.map((item) => ({
        label: item.month,
        value: item.staffHours,
      })),
    },
  ];

  return {
    period: {
      from: months[0].start.clone().format("YYYY-MM-DD"),

      to: months[months.length - 1].end
        .clone()
        .subtract(1, "day")
        .format("YYYY-MM-DD"),
    },

    totals: {
      shifts: totalShifts,

      staffHours: totalStaffHours,
    },
    
    data,

    // series,
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

  /*
   * We only fetch the data that is currently displayed
   * on the home screen.
   *
   * Removed:
   * - todaysShifts
   * - weeklyHours
   * - monthGrowth
   * - weekGrowth
   *
   * Added:
   * - performanceGraph
   */
  const [earnings, performanceGraph] = await Promise.all([
    getEarnings({
      userId,
      timezone: userTimezone,
      userType,
    }),

    getPerformanceGraph({
      userId,
      timezone: userTimezone,
      userType,
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

    performanceGraph,
  };
};

/* =========================================================
   EXPORTS
========================================================= */

module.exports = {
  getHomeData,

  getEarnings,

  getPerformanceGraph,

  calculateShiftHours,
};
