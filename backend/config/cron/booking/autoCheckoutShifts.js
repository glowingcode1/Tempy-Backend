const Booking = require("../../../roles/careHome/booking/Booking");
const {
  closeAbandonedShift,
} = require("../../../roles/careHome/booking/closeAbandonedShift");

/*
 * A worker who checks in and then forgets to check out leaves the booking
 * stuck in "inProgress" for good: the shift never completes, the job never
 * leaves the customer's Active tab, and — since a worker may only hold one
 * open shift at a time — that worker can never check in anywhere again.
 *
 * This sweep closes those shifts once the grace period for a manual check-out
 * has lapsed.
 */

// Bounds the work per run; the sweep is re-entrant, so leftovers wait a tick.
const MAX_PER_RUN = 500;

const autoCheckoutShifts = async () => {
  const now = Date.now();

  /*
   * Coarse filter on the shift date — the exact end time lives in an "HH:mm"
   * string, so the grace period is applied per row by closeAbandonedShift.
   */
  const candidates = await Booking.find({
    status: "inProgress",
    "attendance.checkIn": { $ne: null },
    $or: [
      { "attendance.checkOut": null },
      { "attendance.checkOut": { $exists: false } },
    ],
    "shift.date": { $lte: new Date(now) },
  })
    .select("job shift status")
    .sort({ "shift.date": 1 })
    .limit(MAX_PER_RUN)
    .lean();

  if (!candidates.length) {
    return { checked: 0, closed: 0 };
  }

  let closed = 0;

  for (const booking of candidates) {
    try {
      if (await closeAbandonedShift(booking, now)) closed += 1;
    } catch (err) {
      // One bad row must not strand the rest of the batch.
      console.error(
        `❌ Failed to auto check out booking ${booking._id}:`,
        err.message,
      );
    }
  }

  return { checked: candidates.length, closed };
};

module.exports = autoCheckoutShifts;
module.exports.autoCheckoutShifts = autoCheckoutShifts;
