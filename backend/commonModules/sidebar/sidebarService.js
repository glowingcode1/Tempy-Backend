const mongoose = require("mongoose");

const SidebarSeen = require("./SidebarSeen");
const { User } = require("../../models/UserModel");
const Job = require("../../roles/careHome/job/Job");
const Bid = require("../../roles/aggency/bid/Bid");
const Booking = require("../../roles/careHome/booking/Booking");
const AgreedRate = require("../../roles/careHome/agreedRates/AgreedRates");
const SupplierRelationship = require("../supplierRelationship/SupplierRelationship");
const PermanentHire = require("../permanentHire/PermanentHire");
const Review = require("../reviews/Review");
const Conversation = require("../chatModule/models/Conversation");
const {
  getSupplierBookedJobIds,
  getSupplierTabMatches,
} = require("../../roles/careHome/job/jobRepository");

// The badges each account type's sidebar shows.
const SECTIONS_BY_USER_TYPE = {
  agency: ["shifts", "chat", "jobs", "bids", "agreedRates", "contracts", "permanentHires"],
  homeCareCompany: ["shifts", "chat", "jobs", "bids", "agreedRates", "contracts"],
  nurse: ["shifts", "chat", "jobs", "bids", "agreedRates", "contracts", "permanentHires", "reviews"],
  careHome: ["shifts", "chat", "jobBids", "agreedRates", "contracts", "permanentHires"],
  hospital: ["shifts", "chat", "jobBids"],
  localAuthority: ["shifts", "chat", "jobBids", "contracts"],
  user: ["shifts", "chat", "jobBids", "agreedRates", "contracts"],
};

const SUPPLIER_TYPES = ["agency", "homeCareCompany", "nurse"];

const CANCELLED_BOOKING_STATUSES = [
  "cancelledByWorker",
  "cancelledByEmployer",
  "cancelledByUser",
];

// Outcomes of a supplier's bid that someone else decided.
const BID_OUTCOMES = ["accepted", "rejected", ...CANCELLED_BOOKING_STATUSES];

// A customer's booking once the supplier's staff has accepted it; before that
// the booking is the supplier's private assignment.
const CUSTOMER_BOOKING_CHANGES = [
  "active",
  "inProgress",
  "completed",
  ...CANCELLED_BOOKING_STATUSES,
];

/*
 * Each counter answers "what did the other side do since I last looked?".
 * Agreed rates, contracts and permanent hires record no actor, but their
 * status says whose move it was: a customer's badge counts the supplier's
 * moves and a supplier's the customer's.
 */
const COUNTERS = {
  // New work in the supplier's Active jobs tab: the same filter as that list.
  jobs: async ({ userId, since }) => {
    const [account, booked] = await Promise.all([
      User.findById(userId).select("provideServicesTo").lean(),
      getSupplierBookedJobIds(userId),
    ]);

    const tabs = getSupplierTabMatches({ supplierId: userId, ...booked });

    const allowedUserTypes = Object.entries(account?.provideServicesTo || {})
      .filter(([, allowed]) => allowed === true)
      .map(([userType]) => userType);

    const [row] = await Job.aggregate([
      {
        $match: {
          $and: [
            { status: { $ne: "deleted" }, createdAt: { $gt: since } },
            tabs.active,
          ],
        },
      },
      ...(allowedUserTypes.length
        ? [
            {
              $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                pipeline: [{ $project: { "accountState.userType": 1 } }],
                as: "owner",
              },
            },
            {
              $match: {
                "owner.accountState.userType": { $in: allowedUserTypes },
              },
            },
          ]
        : []),
      { $count: "count" },
    ]);

    return row?.count || 0;
  },

  bids: ({ userId, since }) =>
    Bid.countDocuments({
      user: userId,
      status: { $in: BID_OUTCOMES },
      updatedAt: { $gt: since },
    }),

  // New bids on the customer's jobs that are still open.
  jobBids: ({ userId, since }) =>
    Bid.countDocuments({
      jobCreator: userId,
      status: "pending",
      createdAt: { $gt: since },
    }),

  shifts: ({ userId, userType, since }) => {
    if (SUPPLIER_TYPES.includes(userType)) {
      // A nurse is the worker, whether booked direct or by an agency.
      return Booking.countDocuments({
        ...(userType === "nurse" ? { worker: userId } : { employer: userId }),
        status: { $nin: CANCELLED_BOOKING_STATUSES },
        createdAt: { $gt: since },
      });
    }

    return Booking.countDocuments({
      user: userId,
      status: { $in: CUSTOMER_BOOKING_CHANGES },
      updatedAt: { $gt: since },
    });
  },

  // pending / withdrawn are the supplier's moves; the rest the customer's.
  agreedRates: ({ userId, userType, since }) =>
    AgreedRate.countDocuments({
      ...(SUPPLIER_TYPES.includes(userType)
        ? {
            supplier: userId,
            status: { $in: ["reviewRequested", "accepted", "rejected"] },
          }
        : { customer: userId, status: { $in: ["pending", "withdrawn"] } }),
      updatedAt: { $gt: since },
    }),

  /*
   * The supplier uploads (awaitingCustomer) and countersigns (signed); the
   * customer signs (awaitingSupplier). A nurse can be on either side: the
   * supplier for agreed rates, the "customer" of an agency's staff contract.
   */
  contracts: ({ userId, since }) =>
    SupplierRelationship.countDocuments({
      $or: [
        {
          customer: userId,
          "contract.status": { $in: ["awaitingCustomer", "signed"] },
        },
        { supplier: userId, "contract.status": "awaitingSupplier" },
      ],
      updatedAt: { $gt: since },
    }),

  // The customer requests and cancels; the supplier accepts or rejects.
  permanentHires: ({ userId, userType, since }) =>
    PermanentHire.countDocuments({
      ...(SUPPLIER_TYPES.includes(userType)
        ? { supplier: userId, status: { $in: ["pending", "cancelled"] } }
        : { customer: userId, status: { $in: ["accepted", "rejected"] } }),
      updatedAt: { $gt: since },
    }),

  reviews: ({ userId, since }) =>
    Review.countDocuments({
      objectUser: userId,
      createdAt: { $gt: since },
    }),

  /*
   * Unread conversations in the inbox, the same set the chat list shows.
   * Reading them clears it, not /seen.
   */
  chat: ({ userId }) =>
    Conversation.countDocuments({
      participants: {
        $elemMatch: {
          user: userId,
          chatState: { $in: ["default", "favorite"] },
        },
      },
      [`unreadCounts.${userId}`]: { $gt: 0 },
    }),
};

const sectionsFor = (userType) => SECTIONS_BY_USER_TYPE[userType] || [];

const getSidebarCounts = async ({ userId, userType }) => {
  const sections = sectionsFor(userType);

  if (!sections.length) return {};

  const id = new mongoose.Types.ObjectId(String(userId));

  const [account, seen] = await Promise.all([
    User.findById(id).select("createdAt").lean(),
    SidebarSeen.findOne({ user: id }).lean(),
  ]);

  // Never opened: everything since the account was created is new.
  const createdAt = account?.createdAt || new Date(0);

  const counts = await Promise.all(
    sections.map((section) =>
      COUNTERS[section]({
        userId: id,
        userType,
        since: seen?.seenAt?.[section] || createdAt,
      }),
    ),
  );

  return Object.fromEntries(sections.map((section, i) => [section, counts[i]]));
};

// Returns false when the section is not one of this account's badges.
const markSectionSeen = async ({ userId, userType, section }) => {
  if (!sectionsFor(userType).includes(section)) return false;

  // Chat clears as messages are read, so there is nothing to record.
  if (section !== "chat") {
    await SidebarSeen.updateOne(
      { user: userId },
      { $set: { [`seenAt.${section}`]: new Date() } },
      { upsert: true },
    );
  }

  return true;
};

module.exports = {
  SECTIONS_BY_USER_TYPE,
  getSidebarCounts,
  markSectionSeen,
};
