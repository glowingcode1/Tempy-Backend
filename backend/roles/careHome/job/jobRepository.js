const Job = require("./Job");
const Bid = require("../../aggency/bid/Bid");
const Booking = require("../booking/Booking");
const mongoose = require("mongoose");
const {
  buildKeywordQueryFromModels,
} = require("@helperUtils/dbUtils/queryUtil");
const { generateMeta } = require("@helperUtils/responseUtil");
const {
  findUserById,
} = require("../../../roles/admin/usersManagement/usersRepository");

/*
 * A supplier's Active / Completed tabs cannot be read off Job.status: the
 * same job is Active for whoever holds the booking and gone for everyone
 * else. The tab is derived per supplier, from that supplier's own bookings:
 *
 *   Active    - a live booking of mine (pending / active / inProgress), or a
 *               job still open to bid on (unassigned, with a pending shift),
 *               or one handed to me directly when it was created
 *   Completed - a booking of mine that finished, with none still live on the
 *               same job
 *   Inactive  - a job of mine the customer deactivated
 *
 * The three are mutually exclusive by construction, so the tab counts always
 * add up to the total.
 *
 * Cancelling undoes all of it without any extra work here: the booking leaves
 * both id lists and updateBooking puts the shift back to "pending", so the
 * job reappears in every supplier's Active tab.
 */
const LIVE_BOOKING_STATUSES = ["pending", "active", "inProgress"];

const CANCELLED_BOOKING_STATUSES = [
  "cancelledByWorker",
  "cancelledByEmployer",
  "cancelledByUser",
];

const DAY_MS = 24 * 60 * 60 * 1000;

/*
 * Shift timing. A shift is stored as a UTC day plus "HH:mm" UTC start/end
 * times; an end at or before the start means the shift runs past midnight.
 */
const toMinutes = (time) => {
  if (typeof time !== "string") return 0;
  const [hours, minutes] = time.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes)
    ? hours * 60 + minutes
    : 0;
};

const shiftStartsAt = (shift) =>
  shift?.date
    ? new Date(
        new Date(shift.date).getTime() + toMinutes(shift.startTime) * 60000,
      )
    : null;

const shiftEndsAt = (shift) => {
  if (!shift?.date) return null;
  const start = toMinutes(shift.startTime);
  let end = toMinutes(shift.endTime);
  if (end <= start) end += 24 * 60;
  return new Date(new Date(shift.date).getTime() + end * 60000);
};

// The same calculations as aggregation expressions over a shift variable.
const hhmmToMsExpr = (field) => ({
  $multiply: [
    {
      $add: [
        {
          $multiply: [
            {
              $convert: {
                input: { $arrayElemAt: [{ $split: [field, ":"] }, 0] },
                to: "int",
                onError: 0,
                onNull: 0,
              },
            },
            60,
          ],
        },
        {
          $convert: {
            input: { $arrayElemAt: [{ $split: [field, ":"] }, 1] },
            to: "int",
            onError: 0,
            onNull: 0,
          },
        },
      ],
    },
    60000,
  ],
});

const shiftStartExpr = (v) => ({
  $add: [`$$${v}.date`, hhmmToMsExpr({ $ifNull: [`$$${v}.startTime`, ""] })],
});

const shiftEndExpr = (v) => {
  const start = hhmmToMsExpr({ $ifNull: [`$$${v}.startTime`, ""] });
  const end = hhmmToMsExpr({ $ifNull: [`$$${v}.endTime`, ""] });
  return {
    $add: [`$$${v}.date`, end, { $cond: [{ $lte: [end, start] }, DAY_MS, 0] }],
  };
};

/*
 * A job only counts as past for a supplier one day after its shift has
 * ended (PAST_JOB_GRACE_HOURS, default 24). Until then it stays where it was
 * - in the Active tab - although bidding still closes when the shift starts.
 */
const PAST_JOB_GRACE_MS =
  (Number(process.env.PAST_JOB_GRACE_HOURS) || 24) * 60 * 60 * 1000;

const staleBefore = (now) => new Date(now.getTime() - PAST_JOB_GRACE_MS);

// Not past yet: the shift ended less than the grace period ago, or later.
const recentShiftExpr = (v, now) => ({
  $gt: [shiftEndExpr(v), staleBefore(now)],
});

// Still on the market for suppliers to see: unclaimed, biddable, not past.
const listedShiftExpr = (v, now) => ({
  $and: [
    { $eq: [`$$${v}.status`, "pending"] },
    { $ne: [`$$${v}.isBiddingAllowed`, false] },
    recentShiftExpr(v, now),
  ],
});

// A shift a supplier can still bid on: unclaimed, biddable, not started.
const openShiftExpr = (v, now) => ({
  $and: [
    { $eq: [`$$${v}.status`, "pending"] },
    { $ne: [`$$${v}.isBiddingAllowed`, false] },
    { $gt: [shiftStartExpr(v), now] },
  ],
});

const anyShiftExpr = (condition) => ({
  $anyElementTrue: [
    {
      $map: {
        input: { $ifNull: ["$shift", []] },
        as: "s",
        in: condition,
      },
    },
  ],
});

const isNullExpr = (field) => ({ $eq: [{ $ifNull: [field, null] }, null] });

/*
 * What a supplier (agency, home care company, or nurse - direct or agency
 * staff) is involved in.
 *
 *   liveJobIds      - its own work that is not past yet: a booking, or a won
 *                     bid not yet staffed, whose shift ended less than a day
 *                     ago (PAST_JOB_GRACE_MS) or has not ended
 *   completedJobIds - its own finished work, whenever it was
 *   involvedJobIds  - every job it was booked on or won, past included, so
 *                     that its past work still shows (as inactive)
 */
const getSupplierBookedJobIds = async (supplierId, now = new Date()) => {
  // An agency holds the booking as employer; its staff (and a nurse booked
  // direct) as worker.
  const mine = {
    $or: [{ employer: supplierId }, { worker: supplierId }],
  };

  const [liveBookings, completedJobIds, awardedBids, staffedShiftIds] =
    await Promise.all([
      Booking.find({
        ...mine,
        status: { $in: LIVE_BOOKING_STATUSES },
      })
        .select("job shift")
        .lean(),

      Booking.distinct("job", {
        ...mine,
        status: "completed",
      }),

      /*
       * Won at the bid stage but not staffed yet. Accepting a bid rejects
       * every competing one and closes the shift, so the job is nobody
       * else's - it has to sit in this supplier's Active tab until a worker
       * is assigned.
       */
      Bid.find({ user: supplierId, status: "accepted" })
        .select("job shift")
        .lean(),

      /*
       * An accepted bid stays accepted after its booking is made, so match
       * on the shift to tell "still to staff" from "already staffed".
       *
       * Cancelled bookings are excluded on purpose: when an assigned staff
       * member declines, the shift counts as unstaffed again so the job stays
       * in this supplier's Active tab while it assigns somebody else.
       */
      Booking.distinct("shift._id", {
        ...mine,
        status: { $nin: CANCELLED_BOOKING_STATUSES },
      }),
    ]);

  const staffed = new Set(staffedShiftIds.map(String));

  const staleAt = staleBefore(now);

  const bookedJobIds = liveBookings
    .filter((booking) => shiftEndsAt(booking.shift) > staleAt)
    .map((booking) => booking.job);

  const awaitingStaffJobIds = awardedBids
    .filter((bid) => !staffed.has(String(bid.shift?._id)))
    .filter((bid) => shiftEndsAt(bid.shift) > staleAt)
    .map((bid) => bid.job);

  return {
    liveJobIds: [...bookedJobIds, ...awaitingStaffJobIds],
    completedJobIds,
    involvedJobIds: [
      ...liveBookings.map((booking) => booking.job),
      ...awardedBids.map((bid) => bid.job),
    ],
  };
};

// The tabs a supplier can ask for. Anything else falls back to all of them.
const SUPPLIER_TABS = ["active", "completed", "inactive"];

/*
 * A supplier does not see Job.status. It sees the job as it stands for itself:
 *
 *   completed - it (or its staff) finished work on the job, and has nothing
 *               still ahead there. Shown whatever the date.
 *   active    - its own work not past yet, or a job still on the market:
 *               open to everyone with a shift unclaimed and biddable, or
 *               handed to it when the job was created. "Past" means the
 *               shift ended more than a day ago (PAST_JOB_GRACE_MS); bidding
 *               itself still closes when the shift starts (canBid).
 *   inactive  - everything else it can see: jobs booked by somebody else,
 *               past jobs, jobs the customer deactivated or finished, and its
 *               own past work. Nothing is hidden for being past.
 *
 * Jobs handed to a different supplier at creation are never visible. The
 * three tabs are disjoint, so their counts add up to the total.
 *
 * Each tab is a single $expr so callers can spread it into their own filters.
 * `statusExpr` is the same decision as a value, for the response.
 */
const getSupplierTabMatches = ({
  supplierId,
  liveJobIds,
  completedJobIds,
  involvedJobIds = [],
  now = new Date(),
}) => {
  const live = new Map(liveJobIds.map((id) => [String(id), id]));

  // A job with other work of mine still ahead stays Active, not Completed.
  const completedOnlyIds = completedJobIds.filter(
    (id) => !live.has(String(id)),
  );

  const liveIds = [...live.values()];

  // Anything already decided for me: it cannot also be an open opportunity.
  const settledIds = [...liveIds, ...completedOnlyIds];

  const inIds = (ids) => ({ $in: ["$_id", ids] });

  const notDeleted = { $ne: ["$status", "deleted"] };

  // Posted to the market rather than handed to one supplier.
  const isPublic = { $and: [isNullExpr("$worker"), isNullExpr("$employer")] };

  /*
   * A job can be handed to a supplier when it is created. An agency is named
   * as the employer, a nurse as the worker with no employer at all.
   */
  const assignedToMe = {
    $or: [{ $eq: ["$worker", supplierId] }, { $eq: ["$employer", supplierId] }],
  };

  const isCompleted = { $and: [notDeleted, inIds(completedOnlyIds)] };

  const isActive = {
    $and: [
      notDeleted,
      {
        $or: [
          inIds(liveIds),
          {
            $and: [
              { $not: [inIds(settledIds)] },
              { $eq: ["$status", "active"] },
              {
                $or: [
                  { $and: [isPublic, anyShiftExpr(listedShiftExpr("s", now))] },
                  {
                    $and: [
                      assignedToMe,
                      anyShiftExpr(recentShiftExpr("s", now)),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  const isVisible = {
    $and: [
      notDeleted,
      { $or: [isPublic, assignedToMe, inIds(involvedJobIds)] },
    ],
  };

  const isInactive = {
    $and: [isVisible, { $not: [isActive] }, { $not: [isCompleted] }],
  };

  return {
    active: { $expr: isActive },
    completed: { $expr: isCompleted },
    inactive: { $expr: isInactive },

    /*
     * Every job that is this supplier's in any sense, whatever its status.
     * Only used to scope counts that sit outside the three tabs.
     */
    mine: {
      $or: [
        { _id: { $in: [...settledIds, ...involvedJobIds] } },
        { employer: supplierId },
        { worker: supplierId },
      ],
    },

    statusExpr: {
      $switch: {
        branches: [
          { case: isCompleted, then: "completed" },
          { case: isActive, then: "active" },
        ],
        default: "inactive",
      },
    },
  };
};

/*
 * Per-job view for a supplier.
 *
 *   status            - the job as it stands for this supplier (see
 *                       getSupplierTabMatches); Job.status is kept as
 *                       originalStatus
 *   shift[].status    - likewise per shift: "pending" only while this
 *                       supplier can still take it, "booked" / "completed"
 *                       for its own work, "inactive" for everything else
 *                       (booked by somebody else, or past). The stored value
 *                       is kept as shift[].originalStatus
 *   shift[].canBid    - a bid can be placed on it. A shift already bid on
 *                       cannot take a second bid from the same supplier,
 *                       whatever became of the first.
 *   canBid            - any shift can take a bid
 *   myBooking / myBid - this supplier's latest booking and bid on the job
 */
const supplierViewStages = (supplierId, now, statusExpr) => [
  {
    $lookup: {
      from: "bookings",
      let: { jobId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$job", "$$jobId"] },
                {
                  $or: [
                    { $eq: ["$worker", supplierId] },
                    { $eq: ["$employer", supplierId] },
                  ],
                },
              ],
            },
          },
        },
        { $sort: { createdAt: -1 } },
        { $project: { status: 1, worker: 1, "shift._id": 1 } },
      ],
      as: "myBookings",
    },
  },
  {
    $lookup: {
      from: "bids",
      let: { jobId: "$_id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$job", "$$jobId"] },
                { $eq: ["$user", supplierId] },
              ],
            },
          },
        },
        { $sort: { createdAt: -1 } },
        { $project: { status: 1, bid: 1, "shift._id": 1 } },
      ],
      as: "myBids",
    },
  },
  {
    // Every expression in this stage still sees the stored "$status".
    $addFields: {
      originalStatus: "$status",
      status: statusExpr,
      shift: {
        $map: {
          input: { $ifNull: ["$shift", []] },
          as: "s",
          in: {
            $let: {
              vars: {
                // My live or finished booking on this very shift.
                booking: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$myBookings",
                        as: "b",
                        cond: {
                          $and: [
                            { $eq: ["$$b.shift._id", "$$s._id"] },
                            {
                              $not: [
                                {
                                  $in: [
                                    "$$b.status",
                                    CANCELLED_BOOKING_STATUSES,
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      },
                    },
                    0,
                  ],
                },
                wonIt: {
                  $in: [
                    { k: "$$s._id", v: "accepted" },
                    {
                      $map: {
                        input: "$myBids",
                        as: "bid",
                        in: { k: "$$bid.shift._id", v: "$$bid.status" },
                      },
                    },
                  ],
                },
                // Not past yet (ended less than the grace period ago).
                ahead: recentShiftExpr("s", now),
                onMarket: {
                  $and: [
                    isNullExpr("$worker"),
                    isNullExpr("$employer"),
                    { $eq: ["$status", "active"] },
                  ],
                },
                handedToMe: {
                  $and: [
                    { $eq: ["$status", "active"] },
                    {
                      $or: [
                        { $eq: ["$worker", supplierId] },
                        { $eq: ["$employer", supplierId] },
                      ],
                    },
                  ],
                },
              },
              in: {
                $mergeObjects: [
                  "$$s",
                  {
                    originalStatus: "$$s.status",
                    status: {
                      $switch: {
                        branches: [
                          {
                            case: { $eq: ["$$booking.status", "completed"] },
                            then: "completed",
                          },
                          {
                            case: {
                              $and: [
                                { $ne: [{ $type: "$$booking" }, "missing"] },
                                "$$ahead",
                              ],
                            },
                            then: "$$s.status",
                          },
                          {
                            case: { $and: ["$$wonIt", "$$ahead"] },
                            then: "$$s.status",
                          },
                          {
                            case: { $and: ["$$handedToMe", "$$ahead"] },
                            then: "$$s.status",
                          },
                          {
                            case: {
                              $and: ["$$onMarket", listedShiftExpr("s", now)],
                            },
                            then: "pending",
                          },
                        ],
                        default: "inactive",
                      },
                    },
                    canBid: {
                      $and: [
                        "$$onMarket",
                        openShiftExpr("s", now),
                        { $not: [{ $in: ["$$s._id", "$myBids.shift._id"] }] },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      },
      myBooking: { $ifNull: [{ $arrayElemAt: ["$myBookings", 0] }, null] },
      myBid: { $ifNull: [{ $arrayElemAt: ["$myBids", 0] }, null] },
    },
  },
  {
    $addFields: {
      canBid: { $anyElementTrue: [{ $ifNull: ["$shift.canBid", []] }] },
    },
  },
  { $project: { myBids: 0, myBookings: 0 } },
];

const createJob = async (data) => {
  try {
    if (data.worker || data.employer) {
      data.isSpecial = true;
    }
    const job = new Job(data);
    await job.save();
    return job;
  } catch (err) {
    ``;
    throw err;
  }
};
const getJobsSummary = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  skip,
  userType,
  requester,
  latitude, // user's latitude
  longitude, // user's longitude
  km, // radius in kilometers
  projection,
  worker,
  employer,
}) => {
  const now = new Date();
  const provideServicesToUser = await findUserById(requester);
  const servicePermissions = provideServicesToUser?.provideServicesTo || {};
  const allowedUserTypes = Object.keys(servicePermissions).filter(
    (key) => servicePermissions[key] === true,
  );

  const pipeline = [];

  /*
   * Suppliers get the same view as the full listing: open jobs, and their
   * own live or completed work - never every job on the platform.
   */
  const supplierId =
    worker || employer ? new mongoose.Types.ObjectId(employer || worker) : null;

  const supplierTabs = supplierId
    ? getSupplierTabMatches({
        supplierId,
        now,
        ...(await getSupplierBookedJobIds(supplierId, now)),
      })
    : null;

  // Base filters shared by both geo and non-geo modes
  const baseMatch = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
    ...(supplierTabs
      ? { status: { $ne: "deleted" } }
      : status
        ? { status }
        : { status: { $ne: "deleted" } }),
  };

  const hasGeo =
    latitude != null &&
    longitude != null &&
    km != null &&
    !isNaN(Number(latitude)) &&
    !isNaN(Number(longitude)) &&
    !isNaN(Number(km));

  if (hasGeo) {
    // $geoNear MUST be the first stage; filters go inside `query`
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(latitude), Number(longitude)],
        },
        key: "location",
        distanceField: "distanceInMeters", // distance added to each job
        spherical: true,
        maxDistance: Number(km) * 1000, // km -> meters
        query: baseMatch,
      },
    });
    pipeline.push({
      $addFields: {
        distanceInKM: { $round: [{ $divide: ["$distanceInMeters", 1000] }, 2] },
      },
    });
  } else {
    pipeline.push({ $match: baseMatch });
  }

  // Kept out of $geoNear's query, as in getJobs.
  if (supplierTabs) {
    pipeline.push({
      $match: SUPPLIER_TABS.includes(status)
        ? supplierTabs[status]
        : { $or: SUPPLIER_TABS.map((tab) => supplierTabs[tab]) },
    });
  }

  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$user" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
        { $project: { accountState: 1 } },
      ],
      as: "user",
    },
  });

  pipeline.push({
    $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
  });

  if (allowedUserTypes.length > 0) {
    // Only show jobs whose owner's userType the requester is permitted to see
    pipeline.push({
      $match: { "user.accountState.userType": { $in: allowedUserTypes } },
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Job.schema }],
      keyword,
    );
    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  if (supplierId) {
    pipeline.push(
      ...supplierViewStages(supplierId, now, supplierTabs.statusExpr),
    );
  }

  if (projection) {
    pipeline.push({
      // Keep the calculated distance in compact/summary responses as well.
      $project: {
        ...projection,
        ...(hasGeo && { distanceInKM: 1 }),
        ...(supplierId && { canBid: 1, myBooking: 1, myBid: 1 }),
      },
    });
  }
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Job.aggregate(pipeline);

  const Jobs = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  const [total, active, inactive, completed, deleted] = supplierTabs
    ? await Promise.all([
        Job.countDocuments({
          status: { $ne: "deleted" },
          $or: SUPPLIER_TABS.map((tab) => supplierTabs[tab]),
        }),
        Job.countDocuments({
          status: { $ne: "deleted" },
          ...supplierTabs.active,
        }),
        Job.countDocuments(supplierTabs.inactive),
        Job.countDocuments({
          status: { $ne: "deleted" },
          ...supplierTabs.completed,
        }),
        Job.countDocuments({ ...supplierTabs.mine, status: "deleted" }),
      ])
    : await Promise.all([
        Job.countDocuments({ ...countFilter, status: { $ne: "deleted" } }),
        Job.countDocuments({ ...countFilter, status: "active" }),
        Job.countDocuments({ ...countFilter, status: "inactive" }),
        Job.countDocuments({ ...countFilter, status: "completed" }),
        Job.countDocuments({ ...countFilter, status: "deleted" }),
      ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.JobsCount = { total, active, inactive, completed, deleted };

  return { Jobs, meta };
};
const getDateRange = (range) => {
  const startDate = new Date();
  const endDate = new Date();

  if (range === "next24Hours") {
    endDate.setHours(endDate.getHours() + 24);
  } else if (range === "thisWeek") {
    const day = startDate.getDay(); // 0 = Sunday
    startDate.setDate(startDate.getDate() - day);
    startDate.setHours(0, 0, 0, 0);

    endDate.setTime(startDate.getTime());
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else if (range === "nextWeek") {
    const day = startDate.getDay();
    startDate.setDate(startDate.getDate() - day + 7);
    startDate.setHours(0, 0, 0, 0);

    endDate.setTime(startDate.getTime());
    endDate.setDate(endDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
  } else {
    return null;
  }

  return { startDate, endDate };
};
const getJobs = async ({
  timezone,
  page,
  limit,
  keyword,
  status,
  user,
  skip,
  userType,
  requester,
  latitude, // user's latitude
  longitude, // user's longitude
  km, // radius in kilometers
  worker,
  employer,
  projection,
  dateFilter, // optional date range filter
}) => {
  const now = new Date();

  const addTime = (hours = 0, days = 0) =>
    new Date(now.getTime() + (hours * 60 * 60 + days * 24 * 60 * 60) * 1000);

  const getWeekRange = (weekOffset = 0) => {
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - now.getDay() + weekOffset * 7);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);

    return { startDate, endDate };
  };

  const ranges = {
    next6Hours: { startDate: now, endDate: addTime(6) },
    next12Hours: { startDate: now, endDate: addTime(12) },
    next24Hours: { startDate: now, endDate: addTime(24) },
    next3Days: { startDate: now, endDate: addTime(0, 3) },
    next7Days: { startDate: now, endDate: addTime(0, 7) },
    thisWeek: getWeekRange(),
    nextWeek: getWeekRange(1),
  };
  const provideServicesToUser = await findUserById(requester);
  const servicePermissions = provideServicesToUser?.provideServicesTo || {};
  const allowedUserTypes = Object.keys(servicePermissions).filter(
    (key) => servicePermissions[key] === true,
  );

  const pipeline = [];

  const supplierId =
    worker || employer ? new mongoose.Types.ObjectId(employer || worker) : null;

  const supplierTabs = supplierId
    ? getSupplierTabMatches({
        supplierId,
        now,
        ...(await getSupplierBookedJobIds(supplierId, now)),
      })
    : null;

  /*
   * For a supplier the requested status names a derived tab, not Job.status,
   * so the tab match below owns it and baseMatch only drops deleted jobs.
   */
  const supplierTabMatch = supplierTabs
    ? SUPPLIER_TABS.includes(status)
      ? supplierTabs[status]
      : {
          $or: SUPPLIER_TABS.map((tab) => supplierTabs[tab]),
        }
    : null;

  // Base filters shared by both geo and non-geo modes
  const baseMatch = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
    ...(supplierTabs
      ? { status: { $ne: "deleted" } }
      : status
        ? { status }
        : { status: { $ne: "deleted" } }),
    ...(dateFilter && ranges[dateFilter]
      ? {
          shift: {
            $elemMatch: {
              date: {
                $gte: ranges[dateFilter].startDate,
                $lte: ranges[dateFilter].endDate,
              },
            },
          },
        }
      : {}),
  };

  const hasGeo =
    latitude != null &&
    longitude != null &&
    km != null &&
    !isNaN(Number(latitude)) &&
    !isNaN(Number(longitude)) &&
    !isNaN(Number(km));

  if (hasGeo) {
    // $geoNear MUST be the first stage; filters go inside `query`
    pipeline.push({
      $geoNear: {
        near: {
          type: "Point",
          coordinates: [Number(latitude), Number(longitude)],
        },
        key: "location",
        distanceField: "distanceInMeters", // distance added to each job
        spherical: true,
        maxDistance: Number(km) * 1000, // km -> meters
        query: baseMatch,
      },
    });
    pipeline.push({
      $addFields: {
        distanceInKM: { $round: [{ $divide: ["$distanceInMeters", 1000] }, 2] },
      },
    });
  } else {
    pipeline.push({ $match: baseMatch });
  }
  if (supplierTabMatch) {
    pipeline.push({ $match: supplierTabMatch });
  }

  const assignmentConditions = [];

  // Open jobs (both are null)
  if (!supplierTabMatch) {
    assignmentConditions.push({
      worker: null,
      employer: null,
    });
  }

  // Assigned jobs
  const assignedMatch = {};
  if (dateFilter && ranges[dateFilter]) {
    assignedMatch.shift = {
      $elemMatch: {
        date: {
          $gte: ranges[dateFilter].startDate,
          $lte: ranges[dateFilter].endDate,
        },
      },
    };
  }

  if (worker && !supplierTabMatch) {
    assignedMatch.worker = new mongoose.Types.ObjectId(worker);
  }

  if (employer && !supplierTabMatch) {
    assignedMatch.employer = new mongoose.Types.ObjectId(employer);
  }

  if (Object.keys(assignedMatch).length) {
    assignmentConditions.push(assignedMatch);
  }

  if (assignmentConditions.length > 0) {
    pipeline.push({
      $match: {
        $or: assignmentConditions,
      },
    });
  }

  pipeline.push({
    $lookup: {
      from: "users",
      let: { userId: "$user" },
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$userId"] } } },
        { $project: { name: 1, email: 1, profileIcon: 1, accountState: 1 } },
      ],
      as: "user",
    },
  });

  pipeline.push({
    $unwind: { path: "$user", preserveNullAndEmptyArrays: true },
  });
  pipeline.push({
    $lookup: {
      from: "reviews",
      let: { userId: "$user._id" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: ["$objectUser", "$$userId"],
            },
          },
        },
        {
          $group: {
            _id: null,
            totalReviews: { $sum: 1 },
            averageRating: { $avg: "$rating" },
          },
        },
      ],
      as: "reviewStats",
    },
  });

  pipeline.push({
    $addFields: {
      rating: {
        profileIcon: "$user.profileIcon",
        totalReviews: {
          $ifNull: [{ $arrayElemAt: ["$reviewStats.totalReviews", 0] }, 0],
        },
        averageRating: {
          $round: [
            {
              $ifNull: [{ $arrayElemAt: ["$reviewStats.averageRating", 0] }, 0],
            },
            1,
          ],
        },
      },
    },
  });

  pipeline.push({
    $project: {
      reviewStats: 0,
    },
  });
  pipeline.push({
    $lookup: {
      from: "jobroles",
      let: { typeId: "$type" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [
                "$_id",
                {
                  $convert: {
                    input: "$$typeId",
                    to: "objectId",
                    onError: null,
                    onNull: null,
                  },
                },
              ],
            },
          },
        },
        { $project: { department: 1, title: 1, status: 1 } },
      ],
      as: "type",
    },
  });
  pipeline.push({
    $unwind: { path: "$type", preserveNullAndEmptyArrays: true },
  });
  pipeline.push({
    $lookup: {
      from: "branches",
      let: { branchId: "$branch" },
      pipeline: [
        {
          $match: {
            $expr: {
              $eq: [
                "$_id",
                {
                  $convert: {
                    input: "$$branchId",
                    to: "objectId",
                    onError: null,
                    onNull: null,
                  },
                },
              ],
            },
          },
        },
        { $project: { name: 1, location: 1, status: 1 } },
      ],
      as: "branch",
    },
  });
  pipeline.push({
    $unwind: { path: "$branch", preserveNullAndEmptyArrays: true },
  });
  pipeline.push({
    $lookup: {
      from: "addresses",
      localField: "address",
      foreignField: "_id",
      pipeline: [{ $project: { title: 1, location: 1, status: 1 } }],
      as: "address",
    },
  });
  pipeline.push({
    $unwind: { path: "$address", preserveNullAndEmptyArrays: true },
  });

  pipeline.push({
    $lookup: {
      from: "bids",
      let: { jobId: "$_id" },
      pipeline: [
        { $match: { $expr: { $eq: ["$job", "$$jobId"] } } },
        { $count: "count" },
      ],
      as: "bidsCount",
    },
  });

  pipeline.push({
    $addFields: {
      bidsCount: { $ifNull: [{ $arrayElemAt: ["$bidsCount.count", 0] }, 0] },
    },
  });
  if (allowedUserTypes.length > 0) {
    // Only show jobs whose owner's userType the requester is permitted to see
    pipeline.push({
      $match: { "user.accountState.userType": { $in: allowedUserTypes } },
    });
  }

  if (keyword) {
    const keywordMatch = buildKeywordQueryFromModels(
      [{ schema: Job.schema }],
      keyword,
    );
    if (Object.keys(keywordMatch).length) {
      pipeline.push({ $match: keywordMatch });
    }
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // canBid / myBooking / myBid tell the app which action a job offers.
  if (supplierId) {
    pipeline.push(
      ...supplierViewStages(supplierId, now, supplierTabs.statusExpr),
    );
  }

  if (projection) {
    pipeline.push({
      $project: projection,
    });
  }
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await Job.aggregate(pipeline);

  const Jobs = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  /*
   * JobsCount describes the same jobs the list does, so it is built from the
   * same matches. Without this a supplier got platform-wide tallies - every
   * job of every account - instead of what its own tabs contain.
   *
   * The requested status and dateFilter stay out of it: the buckets below
   * vary those themselves.
   */
  const countFilter = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
  };

  // Everything this requester can see at all, whichever tab it lands in.
  const visibleMatch = supplierTabs
    ? { $or: SUPPLIER_TABS.map((tab) => supplierTabs[tab]) }
    : {};

  /*
   * The list drops deleted jobs in baseMatch, so the counts have to as well -
   * otherwise a soft-deleted job a supplier holds a booking on would be
   * counted in a tab it cannot appear in. The inactive tab carries its own
   * status and overrides this.
   */
  const statusMatches = supplierTabs
    ? {
        active: {
          ...countFilter,
          status: { $ne: "deleted" },
          ...supplierTabs.active,
        },
        inactive: { ...countFilter, ...supplierTabs.inactive },
        completed: {
          ...countFilter,
          status: { $ne: "deleted" },
          ...supplierTabs.completed,
        },
      }
    : {
        active: { ...countFilter, status: "active" },
        inactive: { ...countFilter, status: "inactive" },
        completed: { ...countFilter, status: "completed" },
      };

  // A supplier's deleted count means "jobs of mine the customer deleted",
  // not every deleted job on the platform.
  const deletedMatch = supplierTabs
    ? { ...countFilter, ...supplierTabs.mine, status: "deleted" }
    : { ...countFilter, status: "deleted" };

  const next24Hours = getDateRange("next24Hours");

  const thisWeek = getDateRange("thisWeek");

  const nextWeek = getDateRange("nextWeek");

  const [
    totalCount,
    active,
    inactive,
    completed,
    deleted,
    next6HoursCount,
    next12HoursCount,
    next24HoursCount,
    next3DaysCount,
    next7DaysCount,
    thisWeekCount,
    nextWeekCount,
  ] = await Promise.all([
    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
    }),

    Job.countDocuments(statusMatches.active),

    Job.countDocuments(statusMatches.inactive),

    Job.countDocuments(statusMatches.completed),

    Job.countDocuments(deletedMatch),

    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next6Hours.startDate,
            $lte: ranges.next6Hours.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next12Hours.startDate,
            $lte: ranges.next12Hours.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next24Hours.startDate,
            $lte: ranges.next24Hours.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next3Days.startDate,
            $lte: ranges.next3Days.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.next7Days.startDate,
            $lte: ranges.next7Days.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.thisWeek.startDate,
            $lte: ranges.thisWeek.endDate,
          },
        },
      },
    }),

    Job.countDocuments({
      ...countFilter,
      ...visibleMatch,
      status: { $ne: "deleted" },
      shift: {
        $elemMatch: {
          date: {
            $gte: ranges.nextWeek.startDate,
            $lte: ranges.nextWeek.endDate,
          },
        },
      },
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);

  /*
   * The supplier tabs are disjoint, so their sum is the total. Counting the
   * union separately would be a second answer to the same question, and the
   * two could drift.
   */
  const total = supplierTabs ? active + inactive + completed : totalCount;

  meta.JobsCount = {
    // total covers every status except deleted, so it is always the sum of
    // the three buckets below it - completed included.
    total,
    active,
    inactive,
    completed,
    deleted,
    next6Hours: next6HoursCount,
    next12Hours: next12HoursCount,
    next24Hours: next24HoursCount,
    next3Days: next3DaysCount,
    next7Days: next7DaysCount,
    thisWeek: thisWeekCount,
    nextWeek: nextWeekCount,
  };

  return { Jobs, meta };
};

const findJobById = async (id) => {
  return Job.findById(id)
    .lean()
    .populate("user", "name email profileIcon")
    .populate("address", "title location status");
};
const findJobById_ = async (id, projection = null) => {
  return Job.findById(id, projection || {});
};

const findByIdAndUpdate = async (id, data) => {
  return Job.findByIdAndUpdate(id, data, { new: true })
    .lean()
    .populate("user", "name email profileIcon");
};
const deleteJob = async (id) => {
  return await Job.findByIdAndUpdate(id, { status: "deleted" }, { new: true });
};
const getUserAndShift = async (jobId, shiftId) => {
  const job = await Job.findById(jobId).select("user shift");
  if (!job) return { user: null, shift: null };

  const shift = job.shift.id(shiftId); // Mongoose subdoc lookup by _id
  return {
    user: job.user,
    shift: shift || null,
    _id: shift ? shift._id : null,
  };
};

/*
 * Claim a shift for whoever just won it, atomically.
 *
 * Two customers accepting competing bids on the same shift at the same moment
 * would otherwise both succeed and each reject the other's bid, leaving the
 * shift's owner down to a race. The shift itself is the lock: exactly one
 * update can move it out of "pending", and that caller is the winner.
 *
 * Returns false when somebody else got there first.
 */
const claimShiftForAward = async (jobId, shiftId) => {
  const claimed = await Job.findOneAndUpdate(
    {
      _id: jobId,
      shift: { $elemMatch: { _id: shiftId, status: "pending" } },
    },
    { $set: { "shift.$.status": "booked" } },
    { new: true },
  );

  return Boolean(claimed);
};

/*
 * A job is finished once every one of its shifts is. Suppliers get their
 * Completed tab from their bookings, but the customer's still comes from
 * Job.status - and nothing ever moved a job to "completed", so their
 * Completed tab could never fill.
 */
const completeJobIfAllShiftsDone = async (jobId) => {
  const job = await Job.findById(jobId).select("status shift").lean();

  if (!job || job.status === "deleted" || job.status === "completed") {
    return false;
  }

  const shifts = Array.isArray(job.shift) ? job.shift : [];

  if (!shifts.length || !shifts.every((s) => s?.status === "completed")) {
    return false;
  }

  await Job.updateOne({ _id: jobId }, { $set: { status: "completed" } });

  return true;
};

/*
 * Apply a job edit without clobbering shift state that other requests own.
 *
 * Saving the whole shift array would regenerate shift ids (orphaning bids and
 * bookings) and could write "pending" back over a shift that was claimed a
 * moment ago. Shift writes are conditional on the shift still being
 * "pending", so a shift claimed mid-edit is simply left alone. An edit marked
 * anyStatus only touches fields that do not affect the deal (allowedPersons,
 * isBiddingAllowed) and skips that condition.
 */
const updateJobAndShifts = async (
  jobId,
  { set = {}, shiftEdits = [], removeShiftIds = [], addShifts = [] },
) => {
  const $set = { ...set };
  const arrayFilters = [];

  shiftEdits.forEach(({ _id, changes, anyStatus }, i) => {
    for (const [key, value] of Object.entries(changes)) {
      $set[`shift.$[s${i}].${key}`] = value;
    }
    arrayFilters.push({
      [`s${i}._id`]: new mongoose.Types.ObjectId(String(_id)),
      ...(anyStatus ? {} : { [`s${i}.status`]: "pending" }),
    });
  });

  if (Object.keys($set).length) {
    await Job.updateOne({ _id: jobId }, { $set }, { arrayFilters });
  }

  // $pull and $push cannot touch the same array in one update.
  if (removeShiftIds.length) {
    await Job.updateOne(
      { _id: jobId },
      {
        $pull: {
          shift: {
            _id: {
              $in: removeShiftIds.map(
                (id) => new mongoose.Types.ObjectId(String(id)),
              ),
            },
            status: "pending",
          },
        },
      },
    );
  }

  if (addShifts.length) {
    await Job.updateOne(
      { _id: jobId },
      { $push: { shift: { $each: addShifts } } },
    );
  }

  return Job.findById(jobId).lean();
};

// A job someone is booked on (or working) cannot be deleted from under them.
const hasLiveBookings = async (jobId) => {
  return Boolean(
    await Booking.exists({
      job: jobId,
      status: { $in: LIVE_BOOKING_STATUSES },
    }),
  );
};

const updateShiftStatus = async (jobId, shiftId, status) => {
  const allowed = ["pending", "booked", "completed"];
  if (!allowed.includes(status)) {
    throw new Error(`Invalid status. Allowed: ${allowed.join(", ")}`);
  }

  const updatedJob = await Job.findOneAndUpdate(
    { _id: jobId, "shift._id": shiftId },
    { $set: { "shift.$.status": status } },
    { new: true },
  );

  if (!updatedJob) {
    throw new Error("Job or shift not found");
  }

  return updatedJob;
};

module.exports = {
  createJob,
  getJobs,

  /*
   * The supplier dashboard counts the same matches this module builds, so
   * that dashboard totals, meta counts and the tabs cannot disagree.
   */
  getSupplierBookedJobIds,
  getSupplierTabMatches,
  SUPPLIER_TABS,
  findJobById,
  findByIdAndUpdate,
  deleteJob,
  findJobById_,
  getUserAndShift,
  getJobsSummary,
  updateShiftStatus,
  claimShiftForAward,
  completeJobIfAllShiftsDone,
  updateJobAndShifts,
  hasLiveBookings,
  shiftStartsAt,
};
