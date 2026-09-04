const { getFullImageUrl } = require("@helperUtils/imageHelper");
const {
  convertUtcToTimezone,
  formatShiftToTimezone,
  getShiftStartUtc,
} = require("@helperUtils/responseUtil");
const moment = require("moment-timezone");

// statuses that count as "attended" for late check-in
const ATTENDED_STATUSES = ["inProgress", "completed"]; // adjust to your enum

function formatStaffProfile(data, timezone) {
  const {
    basicInfo = {},
    documentation = {},
    reviews = [],
    bookings = [],
  } = data;

  // ---- 1. Format all images ----
  if (basicInfo.profileIcon)
    basicInfo.profileIcon = getFullImageUrl(basicInfo.profileIcon);
  documentation.governmentIdentity = (
    documentation.governmentIdentity || []
  ).map((img) => getFullImageUrl(img));
  documentation.degree = (documentation.degree || []).map((img) =>
    getFullImageUrl(img),
  );
  documentation.certification = (documentation.certification || []).map((img) =>
    getFullImageUrl(img),
  );
  const formattedReviews = reviews.map((r) => ({
    ...r,
    subject: {
      ...r.subject,
      profileIcon: getFullImageUrl(r.subject?.profileIcon),
    },
  }));

  // ---- 2. Average staff rating (from reviews) ----
  const averageRating = formattedReviews.length
    ? Number(
        (
          formattedReviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
          formattedReviews.length
        ).toFixed(1),
      )
    : 0;

  // ---- 3. Booking-derived stats ----
  const startOfMonth = moment().startOf("month");
  const endOfMonth = moment().endOf("month");

  let thisMonthEarning = 0;
  let pendingInvoices = 0;
  let lateCheckIns = 0;

  for (const booking of bookings) {
    const payment = booking.payment || {};
    const attendance = booking.attendance || {};
    const shift = booking.shift || {};

    // Pending invoice: not yet paid to worker
    if (payment.amountPayedToWorker === 0) {
      pendingInvoices += 1;
    }

    // This month earning: money actually paid this month
    if (payment.status === "paid") {
      const paidAt = moment(payment.paidAt);
      if (paidAt.isBetween(startOfMonth, endOfMonth, null, "[]")) {
        thisMonthEarning += payment.amountPayedToWorker || 0;
      }
    }

    // Late check-in: only for attended bookings, this month
    if (
      ATTENDED_STATUSES.includes(booking.status) &&
      attendance.checkIn &&
      shift.date &&
      shift.startTime
    ) {
      const shiftStart = getShiftStartUtc(shift);
      const checkIn = moment.utc(attendance.checkIn);

      if (
        checkIn.isBetween(startOfMonth, endOfMonth, null, "[]") &&
        checkIn.isAfter(shiftStart)
      ) {
        lateCheckIns += 1;
      }
    }
  }
  // ---- Divide bookings by status ----
  const groupedBookings = {
    pending: [],
    inProgress: [],
    completed: [],
  };

  for (const booking of bookings) {
    if (groupedBookings[booking.status]) {
      groupedBookings[booking.status].push({
        ...booking,
        shift: Array.isArray(booking.shift)
          ? booking.shift.map((s) => formatShiftToTimezone(s, timezone))
          : formatShiftToTimezone(booking.shift, timezone),
        attendance: booking.attendance
          ? {
              ...booking.attendance,
              checkIn: booking.attendance.checkIn
                ? convertUtcToTimezone(booking.attendance.checkIn, timezone)
                : booking.attendance.checkIn,
              checkOut: booking.attendance.checkOut
                ? convertUtcToTimezone(booking.attendance.checkOut, timezone)
                : booking.attendance.checkOut,
            }
          : booking.attendance,
      });
    }
  }

  return {
    ...data,
    reviews: formattedReviews,
    bookings: groupedBookings,
    stats: {
      thisMonthEarning,
      pendingInvoices,
      averageRating,
      lateCheckIns,
    },
  };
}

module.exports = { formatStaffProfile };
