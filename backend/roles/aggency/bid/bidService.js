const BidRepo = require("./bidRepository");
const formatBidToTimezone = require("./formator/formatBidToTimezone");
const moment = require("moment-timezone");
const {
  findBookingByBid,
} = require("../../careHome/booking/bookingRepository");
const { updateShiftStatus } = require("../../careHome/job/jobRepository");

const createBid = async (data, timezone) => {
  const Bid = await BidRepo.createBid(data);
  return Bid?.error ? Bid : formatBidToTimezone(Bid.toObject(), timezone);
};

const getBid = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  jobCreator,
  dateFilter,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { bid, meta } = await BidRepo.getBid({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    jobCreator,
    skip,
    dateFilter,
  });
  const formatedBid = bid.map((job) => {
    return formatBidToTimezone(job, timezone);
  });

  return { bid: formatedBid, meta };
};

const sameId = (a, b) => Boolean(a) && String(a._id || a) === String(b);

// Shift dates are stored as a UTC day plus a UTC "HH:mm" start time.
const shiftHasStarted = (shift) => {
  if (!shift?.date || !shift?.startTime) return true;
  const day = moment.utc(shift.date).format("YYYY-MM-DD");
  const start = moment.utc(`${day} ${shift.startTime}`, "YYYY-MM-DD HH:mm");
  return !start.isValid() || !start.isAfter(moment.utc());
};

/*
 * A supplier giving up a bid it already won. If nobody has been booked on it
 * yet the shift goes back on the market, exactly as when the unstaffed-award
 * sweep releases it. Once a booking exists, the booking owns the shift and
 * has to be cancelled instead.
 */
const releaseWonBid = async (Bid, status) => {
  if (await findBookingByBid(Bid._id)) {
    return { error: "Cannot_withdraw_bid_with_active_booking" };
  }

  if (shiftHasStarted(Bid.shift)) {
    // Too late to re-sell it; only close the award.
    await BidRepo.findByIdAndUpdate(Bid._id, { status });
    return {};
  }

  await BidRepo.updateBidStatuses(Bid._id, status, "pending");
  await updateShiftStatus(
    Bid.job.toString(),
    Bid.shift._id.toString(),
    "pending",
  );
  return {};
};

const updateBid = async (id, data, timezone) => {
  const Bid = await BidRepo.findBidById_(id);

  if (!Bid) return null;

  const isAdmin = data.userType === "admin";

  // Customers act on bids through PUT /job/bids/:id, not here.
  if (!isAdmin && !sameId(Bid.user, data.user)) return null;

  // Accepting a bid is only done via jobService.updateJobBidStatus.
  if (data.status === "accepted") {
    return { error: "status_not_allowed" };
  }
  if (!isAdmin && data.status !== undefined && data.status !== "withdraw") {
    return { error: "status_not_allowed" };
  }

  const editsTerms = ["bid", "note", "shift", "job"].some(
    (key) => data[key] !== undefined,
  );

  // Terms are fixed once the bid has been settled either way.
  if (editsTerms && Bid.status !== "pending") {
    return { error: "Bid_not_editable" };
  }

  const updateData = {};
  for (const key of ["bid", "note", "status"]) {
    if (data[key] !== undefined) updateData[key] = data[key];
  }

  if (data.shift && data.job) {
    const [{ user, shift }, snapshot] = await Promise.all([
      BidRepo.getUserAndShift(data.job, data.shift),
      BidRepo.findJobById_(data.job),
    ]);

    if (!shift || !user || !snapshot) {
      return { error: "Invalid_job_or_shift" };
    }
    if (shift.status !== "pending" || shift.isBiddingAllowed === false) {
      return { error: "Bid_not_available" };
    }

    const movesShift = String(shift._id) !== String(Bid.shift._id);
    if (
      movesShift &&
      (await BidRepo.findUserBidForShift(Bid.user, shift._id))
    ) {
      return { error: "Bid_already_exists_for_this_user_against_this_shift" };
    }

    Object.assign(updateData, {
      job: data.job,
      shift,
      snapshot,
      jobCreator: user,
      type: snapshot.type,
    });
  }

  if (Object.keys(updateData).length === 0) {
    return formatBidToTimezone(Bid.toObject(), timezone);
  }

  if (updateData.status !== undefined) {
    if (!["pending", "accepted"].includes(Bid.status)) {
      return { error: "Bid_not_available" };
    }

    if (Bid.status === "accepted") {
      const released = await releaseWonBid(Bid, updateData.status);
      if (released.error) return released;

      const fresh = await BidRepo.findBidById_(id);
      return formatBidToTimezone(fresh.toObject(), timezone);
    }
  }

  Object.assign(Bid, updateData);
  await Bid.save();
  return formatBidToTimezone(Bid.toObject(), timezone);
};

const canSeeBid = (Bid, requesterId) =>
  sameId(Bid.user, requesterId) || sameId(Bid.jobCreator, requesterId);

const getBidDetails = async (id, timezone, { requesterId, isAdmin } = {}) => {
  const Bid = await BidRepo.findBidById(id);

  if (!Bid) {
    return null;
  }

  if (!isAdmin && !canSeeBid(Bid, requesterId)) {
    return null;
  }

  return formatBidToTimezone(Bid, timezone);
};

const deleteBid = async (id, { requesterId, isAdmin } = {}) => {
  if (!id) throw new Error("Bid ID is required");

  const Bid = await BidRepo.findBidById_(id);
  if (!Bid || Bid.status === "deleted") return null;
  if (!isAdmin && !sameId(Bid.user, requesterId)) return null;

  // A won bid has to be withdrawn, which also hands the shift back.
  if (Bid.status === "accepted") {
    return { error: "Withdraw_accepted_bid_before_deleting" };
  }

  const deleted = await BidRepo.deleteBid(id);
  return deleted ? {} : null;
};

module.exports = {
  createBid,
  getBid,
  updateBid,
  deleteBid,
  getBidDetails,
};
