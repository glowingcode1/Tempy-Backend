const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const BidRepo = require("./bidRepository");
const BookingRepo = require("../../careHome/booking/bookingRepository");
const BookingService = require("../../careHome/booking/bookingService");
const { cache, invalidate } = require("@redisCache");
const formatBidToTimezone = require("./formator/formatBidToTimezone");

const createBid = async (data) => {
  const Bid = await BidRepo.createBid(data);
  return Bid;
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

const updateBid = async (id, data) => {
  const Bid = await BidRepo.findBidById_(id);
  if (data.shift && data.job) {
    const [{ user, shift }, snapshot] = await Promise.all([
      BidRepo.getUserAndShift(data.job, data.shift),
      BidRepo.findJobById_(data.job),
    ]);

    data.snapshot = snapshot;
    data.jobCreator = user;
    data.shift = shift;
  }

  if (!Bid) {
    return { error: "Bid_not_found" };
  }

  const allowedFields = ["bid", "note", "status", "shift", "job"];

  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Bid;
  }

  const isAccepting =
    updateData.status === "accepted" && Bid.status !== "accepted";

  if (isAccepting) {
    const conflictingBooking = await BookingRepo.findConflictingBooking(
      Bid.user,
      Bid.shift,
    );

    if (conflictingBooking) {
      updateData.status = "rejected";
      Object.assign(Bid, updateData);
      await Bid.save();
      return { error: "Bid_rejected_due_to_nurse_unavailability" };
    }
  }

  Object.assign(Bid, updateData);
  await Bid.save();

  if (isAccepting) {
    const booking = await BookingService.createBooking({
      bid: Bid._id,
      worker: Bid.user,
      createdByUserType: data.userType,
      createdByUserId: data.user,
    });

    if (booking && booking.error) {
      if (booking.error === "Worker_already_assigned_during_this_time") {
        Bid.status = "rejected";
        await Bid.save();
        return { error: "Bid_rejected_due_to_nurse_unavailability" };
      }

      Bid.status = "pending";
      await Bid.save();
      return booking;
    }
  }

  return Bid;
};

const getBidDetails = async (id, timezone) => {
  const Bid = await BidRepo.findBidById(id);

  if (!Bid) {
    return null;
  }

  return formatBidToTimezone(Bid, timezone);
};
const deleteBid = async (id) => {
  if (!id) throw new Error("Bid ID is required");
  const deleted = await BidRepo.deleteBid(id);
  return !!deleted;
};

module.exports = {
  createBid,
  getBid,
  updateBid,
  deleteBid,
  getBidDetails,
};
