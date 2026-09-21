const Booking = require("./Booking");
const { CHECK_OUT_GRACE_MIN, shiftEndsAt } = require("./attendanceWindow");
const {
  updateShiftStatus,
  completeJobIfAllShiftsDone,
} = require("../job/jobRepository");

/*
 * Close a shift the worker checked in to and never checked out of.
 *
 * The check-out is recorded at the shift's scheduled end time rather than at
 * the moment this runs: nobody knows when the worker actually left, and the
 * hours agreed are the hours to pay. The row is flagged autoCheckedOut so a
 * timesheet can show it was not the worker's own check-out and correct it if
 * the real times differ.
 *
 * Returns true only when this call was the one that closed the booking, so a
 * concurrent manual check-out is never counted or overwritten.
 */
const closeAbandonedShift = async (booking, now = Date.now()) => {
  if (!booking?._id || booking.status !== "inProgress") return false;

  const endsAt = shiftEndsAt(booking.shift);

  // Unreadable times would mean guessing at a check-out; leave it alone.
  if (!endsAt) return false;

  // Still inside the worker's own window to check out by hand.
  if (now <= endsAt.getTime() + CHECK_OUT_GRACE_MIN * 60 * 1000) return false;

  /*
   * Conditional on the booking still being open, so a check-out that lands
   * between the caller's read and this write wins instead of being clobbered.
   */
  const result = await Booking.updateOne(
    { _id: booking._id, status: "inProgress" },
    {
      $set: {
        status: "completed",
        "attendance.checkOut": endsAt,
        "attendance.autoCheckedOut": true,
      },
    },
  );

  if (!result.modifiedCount) return false;

  const jobId = booking.job?.toString();
  const shiftId = booking.shift?._id?.toString();

  /*
   * Same follow-up as a manual check-out: without it the shift stays open on
   * the job, so the job never leaves the customer's Active tab.
   */
  if (jobId && shiftId) {
    await updateShiftStatus(jobId, shiftId, "completed");
    await completeJobIfAllShiftsDone(jobId);
  }

  return true;
};

module.exports = { closeAbandonedShift };
