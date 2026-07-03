const { getCurrentDateInTimezone } = require("@helperUtils/responseUtil");
const BidRepo = require("./bidRepository");
const { cache, invalidate } = require("@redisCache");
const formatBidToTimezone = require("./formator/formatBidToTimezone");

const createBid = async (data) => {
  const Bid = await BidRepo.createBid(data);
  return Bid;
};

const getBid = async ({ timezone, page, limit, keyword, status, user }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const { bid, meta } = await BidRepo.getBid({
    timezone,
    page,
    limit,
    keyword,
    status,
    user,
    skip,
  });
  const formatedBid = bid.map((job) => {
    return formatBidToTimezone(job, timezone);
  });

  return { bid: formatedBid, meta };
};

const updateBid = async (id, data) => {
  const Bid = await BidRepo.findBidById_(id);
  if(data.shift && data.job) {
      const [{ user, shift }, snapshot] = await Promise.all([
        BidRepo.getUserAndShift(data.job, data.shift),
        BidRepo.findJobById_(data.job),
      ]);

      data.snapshot = snapshot;
      data.jobCreater = user;
      data.shift = shift;
  }

  if (!Bid) {
    return { error: "Bid_not_found" };
  }

  const allowedFields = [
    "bid",
    "note",
    "status",
    "shift",
    "job",
  ];

  const updateData = {};

  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return Bid;
  }


  Object.assign(Bid, updateData);
  await Bid.save();

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
