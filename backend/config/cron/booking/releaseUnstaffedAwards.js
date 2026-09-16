const Bid = require("../../../roles/aggency/bid/Bid");
const Booking = require("../../../roles/careHome/booking/Booking");
const {
  updateBidStatuses,
  findByIdAndUpdate: findBidByIdAndUpdate,
} = require("../../../roles/aggency/bid/bidRepository");
const { updateShiftStatus } = require("../../../roles/careHome/job/jobRepository");

/*
 * An Agency or HomeCareCompany that wins a bid still has to assign one of its
 * own staff before a booking exists. Accepting the bid closes the shift to
 * every other supplier, so if the agency never staffs it nobody can: the
 * customer silently loses the shift and the job sits in the winner's Active
 * tab for good.
 *
 * This sweep releases those stale awards:
 *
 *   - shift still in the future -> put it back on the market (the award is
 *     closed, competing bids return to pending, the shift returns to pending)
 *   - shift already started     -> it cannot be re-sold, so only close the
 *     award out, which at least frees the job from the Active tab
 *
 * A booking that was created and then cancelled does not count as staffed -
 * the supplier is expected to assign somebody else, and that reassignment is
 * itself subject to this grace period.
 */

const CANCELLED_BOOKING_STATUSES = [
  "cancelledByWorker",
  "cancelledByEmployer",
  "cancelledByUser",
];

// How long a supplier gets to assign staff before the award is released.
const GRACE_MINUTES = Number(process.env.UNSTAFFED_AWARD_GRACE_MINUTES) || 120;

/*
 * A shift starting sooner than this is released without waiting out the grace
 * period. Otherwise a shift won 10 minutes before it starts could never be
 * re-offered in time: the grace period would outlast the shift itself.
 */
const IMMINENT_MINUTES =
  Number(process.env.UNSTAFFED_AWARD_IMMINENT_MINUTES) || 180;

// Bounds the work per run; the sweep is re-entrant, so leftovers wait a tick.
const MAX_PER_RUN = 500;

const toMinutes = (time) => {
  if (typeof time !== "string") return 0;

  const [hours, minutes] = time.split(":").map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;

  return hours * 60 + minutes;
};

// The shift carries a UTC date plus an "HH:mm" start time.
const shiftStartsAt = (shift) => {
  if (!shift?.date) return null;

  const start = new Date(shift.date);

  if (Number.isNaN(start.getTime())) return null;

  return new Date(start.getTime() + toMinutes(shift.startTime) * 60 * 1000);
};

const releaseUnstaffedAwards = async () => {
  const now = new Date();
  const cutoff = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000);

  /*
   * updatedAt moves when the bid is accepted, so it doubles as "awarded at".
   * Oldest first, so a backlog drains in order rather than starving.
   */
  const imminentBefore = new Date(
    now.getTime() + IMMINENT_MINUTES * 60 * 1000,
  );

  const awards = await Bid.find({
    status: "accepted",
    $or: [
      { updatedAt: { $lte: cutoff } },
      // Coarse by date; the exact start time is checked per row below.
      { "shift.date": { $lte: imminentBefore } },
    ],
  })
    .select("job shift user updatedAt")
    .sort({ updatedAt: 1 })
    .limit(MAX_PER_RUN)
    .lean();

  if (!awards.length) {
    return { checked: 0, reopened: 0, closed: 0 };
  }

  // One query for the whole batch rather than a lookup per award.
  const staffedBidIds = await Booking.distinct("bid", {
    bid: { $in: awards.map((award) => award._id) },
    status: { $nin: CANCELLED_BOOKING_STATUSES },
  });

  const staffed = new Set(staffedBidIds.map(String));

  let reopened = 0;
  let closed = 0;

  for (const award of awards) {
    if (staffed.has(String(award._id))) continue;

    const shiftId = award.shift?._id;

    if (!award.job || !shiftId) continue;

    const startsAt = shiftStartsAt(award.shift);

    /*
     * Release once the supplier has had its grace period, or sooner if the
     * shift is about to start and still has nobody on it.
     */
    const graceExpired = award.updatedAt
      ? new Date(award.updatedAt) <= cutoff
      : true;

    const imminent = startsAt ? startsAt <= imminentBefore : false;

    if (!graceExpired && !imminent) continue;

    const stillSellable = startsAt ? startsAt > now : false;

    try {
      if (stillSellable) {
        /*
         * Close this award and hand the shift back: competing bids return to
         * pending so those suppliers can win it, exactly as when a booking
         * is cancelled.
         */
        await updateBidStatuses(award._id, "cancelledByEmployer", "pending");
        await updateShiftStatus(
          award.job.toString(),
          shiftId.toString(),
          "pending",
        );

        reopened += 1;
      } else {
        /*
         * The shift has started or passed. Reopening it would advertise work
         * nobody can do, so close the award alone and leave the shift and the
         * competing bids as they are.
         */
        await findBidByIdAndUpdate(award._id, {
          status: "cancelledByEmployer",
        });

        closed += 1;
      }
    } catch (err) {
      // One bad row must not strand the rest of the batch.
      console.error(
        `❌ Failed to release unstaffed award ${award._id}:`,
        err.message,
      );
    }
  }

  return { checked: awards.length, reopened, closed };
};

module.exports = releaseUnstaffedAwards;
module.exports.releaseUnstaffedAwards = releaseUnstaffedAwards;
module.exports.GRACE_MINUTES = GRACE_MINUTES;
module.exports.shiftStartsAt = shiftStartsAt;
