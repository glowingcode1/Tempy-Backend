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

const getSupplierBookedJobIds = async (supplierId) => {
  // An agency holds the booking as employer; a nurse booked direct is both.
  const mine = {
    $or: [{ employer: supplierId }, { worker: supplierId }],
  };

  const [bookedJobIds, completedJobIds, awardedBids, staffedShiftIds] =
    await Promise.all([
      Booking.distinct("job", {
        ...mine,
        status: { $in: LIVE_BOOKING_STATUSES },
      }),

      Booking.distinct("job", {
        ...mine,
        status: "completed",
      }),

      /*
       * Won at the bid stage but not staffed yet. Accepting a bid rejects
       * every competing one and closes the shift, so the job is nobody
       * else's - it has to sit in this supplier's Active tab until a worker
       * is assigned, not disappear from everyone's.
       */
      Bid.find({ user: supplierId, status: "accepted" })
        .select("job shift._id")
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

  const awaitingStaffJobIds = awardedBids
    .filter((bid) => !staffed.has(String(bid.shift?._id)))
    .map((bid) => bid.job);

  return {
    liveJobIds: [...bookedJobIds, ...awaitingStaffJobIds],
    completedJobIds,
  };
};

// The tabs a supplier can ask for. Anything else falls back to all of them.
const SUPPLIER_TABS = ["active", "completed", "inactive"];

const getSupplierTabMatches = ({ supplierId, liveJobIds, completedJobIds }) => {
  const live = new Map(liveJobIds.map((id) => [String(id), id]));

  /*
   * A job whose other shift is still running stays Active, not Completed.
   * Subtracting here rather than at the call site is what makes the three
   * tabs disjoint no matter who builds them.
   */
  const completedOnlyIds = completedJobIds.filter(
    (id) => !live.has(String(id)),
  );

  const liveIds = [...live.values()];

  // Anything already decided for me: it cannot also be an open opportunity.
  const settledIds = [...liveIds, ...completedOnlyIds];

  return {
    active: {
      $or: [
        { _id: { $in: liveIds } },

        {
          _id: { $nin: settledIds },
          status: "active",
          $or: [
            // Open to bid on - nobody is booked for it yet.
            { worker: null, employer: null, "shift.status": "pending" },

            // Handed to me directly when the job was created.
            { employer: supplierId },
          ],
        },
      ],
    },

    completed: {
      _id: { $in: completedOnlyIds },
    },

    inactive: {
      _id: { $nin: settledIds },
      status: "inactive",
      employer: supplierId,
    },

    /*
     * Every job that is this supplier's in any sense, whatever its status.
     * Only used to scope counts that sit outside the three tabs.
     */
    mine: {
      $or: [
        { _id: { $in: settledIds } },
        { employer: supplierId },
      ],
    },
  };
};

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
}) => {
  const provideServicesToUser = await findUserById(requester);
  const servicePermissions = provideServicesToUser?.provideServicesTo || {};
  const allowedUserTypes = Object.keys(servicePermissions).filter(
    (key) => servicePermissions[key] === true,
  );

  const pipeline = [];

  // Base filters shared by both geo and non-geo modes
  const baseMatch = {
    ...(user && { user: new mongoose.Types.ObjectId(user) }),
    ...(status ? { status } : { status: { $ne: "deleted" } }),
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
  if (projection) {
    pipeline.push({
      // Keep the calculated distance in compact/summary responses as well.
      $project: hasGeo ? { ...projection, distanceInKM: 1 } : projection,
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

  const [total, active, inactive, completed, deleted] = await Promise.all([
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
    worker || employer
      ? new mongoose.Types.ObjectId(employer || worker)
      : null;

  const supplierTabs = supplierId
    ? getSupplierTabMatches({
        supplierId,
        ...(await getSupplierBookedJobIds(supplierId)),
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
  return Job.findById(id).lean().populate("user", "name email profileIcon");
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
};
