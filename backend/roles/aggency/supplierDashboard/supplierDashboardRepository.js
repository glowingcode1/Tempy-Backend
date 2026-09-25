const Job = require("../../careHome/job/Job");
const Bid = require("../bid/Bid");
const Staff = require("../staff/Staff");
const Booking = require("../../careHome/booking/Booking");
const {
  getEarningsSummary,
  getEarningsGraph,
} = require("../../careHome/booking/earnings");
const Branches = require("../../aggency/branches/Branches");
const { User } = require("../../../models/UserModel");
const mongoose = require("mongoose");
const {
  getSupplierBookedJobIds,
  getSupplierTabMatches,
  anyShiftExpr,
  openShiftExpr,
  shiftStartsAt,
} = require("../../careHome/job/jobRepository");
const { formatShiftToTimezone } = require("@helperUtils/responseUtil");

// ============================================================
// HELPERS
// ============================================================

const toObjectId = (value) => {
  if (!value) return null;

  if (value instanceof mongoose.Types.ObjectId) return value;

  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(value)
    : null;
};

// Job.status minus "deleted", which never belongs in a dashboard count.
const JOB_STATUSES = ["active", "inactive", "completed"];

const CANCELLED_BOOKING_STATUSES = [
  "cancelledByWorker",
  "cancelledByEmployer",
  "cancelledByUser",
];

const uniqueIds = (...lists) => {
  const byId = new Map();

  lists.flat().forEach((id) => {
    if (id) byId.set(String(id), id);
  });

  return [...byId.values()];
};

/*
 * Which bookings belong to this supplier depends on how it supplies work.
 *
 * An agency or home care company is the employer on its staff's bookings. A
 * nurse bidding directly is the worker, and the booking has no employer at
 * all - so scoping the whole dashboard by employer showed a nurse with won
 * bids an entirely empty one.
 *
 * Shifts a nurse worked for an agency are included here: they are work the
 * nurse did. The money for them is not, because it is the agency's - see
 * booking/earnings.js.
 */
const getSupplierBookingMatch = ({ userId, userType }) =>
  userType === "nurse" ? { worker: userId } : { employer: userId };

/*
 * The account the dashboard is about, which is not always the caller: an
 * admin may open it with ?userId=. The userType decides every booking match,
 * so it is read from that account rather than assumed.
 */
const getDashboardUserType = async (userId) => {
  const account = await User.findById(userId)
    .select("userType accountState")
    .lean();

  return account?.accountState?.userType || account?.userType || null;
};

/*
 * A Job is always created by the CUSTOMER (careHome / hospital / user),
 * so Job.user is never the supplier. A job only becomes the supplier's
 * once it has actually been won:
 *
 *   - an accepted bid of theirs      -> Bid.user = supplier, status accepted
 *   - a live booking of theirs       -> see getSupplierBookingMatch
 *   - jobs assigned directly to them -> Job.employer = supplier
 *
 * Pending / rejected / withdrawn bids are NOT jobs. They already have their
 * own counts in the bids section, and counting them here made a supplier who
 * had won nothing look like they had a full job list.
 *
 * Cancelling drops the job on both sides: it resets the bid to cancelledBy*
 * (see updateBidStatuses), so the job stops being theirs.
 */
const getSupplierJobMatch = async ({ userId, userType }) => {
  // The match also feeds $match, which does not cast the way find() does.
  userId = toObjectId(userId) || userId;

  const [acceptedBidJobIds, bookedJobIds] = await Promise.all([
    Bid.distinct("job", {
      user: userId,
      status: "accepted",
    }),

    Booking.distinct("job", {
      ...getSupplierBookingMatch({ userId, userType }),
      status: {
        $nin: CANCELLED_BOOKING_STATUSES,
      },
    }),
  ]);

  return {
    $or: [
      {
        _id: {
          $in: uniqueIds(acceptedBidJobIds, bookedJobIds),
        },
      },
      {
        employer: userId,
      },
    ],

    status: {
      $ne: "deleted",
    },
  };
};

const getMonthRange = (months = 12) => {
  const now = new Date();

  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
  );

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return {
    start,
    end,
  };
};

const getMonthlyCategories = (months = 12) => {
  const categories = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i -= 1) {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
    );

    categories.push(
      date.toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
    );
  }

  return categories;
};

// ============================================================
// GENERIC MONTHLY AGGREGATION
// ============================================================

const getMonthlyAggregation = async ({
  Model,
  match,
  dateField = "createdAt",
  months = 12,
}) => {
  const { start, end } = getMonthRange(months);

  const result = await Model.aggregate([
    {
      $match: {
        ...match,
        [dateField]: {
          $gte: start,
          $lt: end,
        },
      },
    },

    {
      $group: {
        _id: {
          year: {
            $year: `$${dateField}`,
          },

          month: {
            $month: `$${dateField}`,
          },
        },

        count: {
          $sum: 1,
        },
      },
    },

    {
      $sort: {
        "_id.year": 1,
        "_id.month": 1,
      },
    },
  ]);

  const values = new Array(months).fill(0);

  result.forEach((item) => {
    const index =
      (item._id.year - start.getUTCFullYear()) * 12 +
      (item._id.month - 1 - start.getUTCMonth());

    if (index >= 0 && index < months) {
      values[index] = item.count;
    }
  });

  return values;
};

// ============================================================
// JOB STATS
// ============================================================

/*
 * The dashboard must not answer "how many active jobs?" differently from the
 * jobs listing, so it counts the very same matches the listing and its meta
 * counts are built from, rather than a second definition of its own.
 *
 * The three tabs are disjoint, so their sum is the total.
 */
const getJobStats = async ({ userId }) => {
  const tabs = getSupplierTabMatches({
    supplierId: userId,
    ...(await getSupplierBookedJobIds(userId)),
  });

  // The listing drops deleted jobs; the inactive tab carries its own status.
  const notDeleted = { status: { $ne: "deleted" } };

  const [activeJobs, inactiveJobs, completedJobs] = await Promise.all([
    Job.countDocuments({ ...notDeleted, ...tabs.active }),

    Job.countDocuments({ ...notDeleted, ...tabs.inactive }),

    Job.countDocuments({ ...notDeleted, ...tabs.completed }),
  ]);

  return {
    totalJobs: activeJobs + inactiveJobs + completedJobs,
    activeJobs,
    inactiveJobs,
    completedJobs,
  };
};

// ============================================================
// BOOKING STATS
// ============================================================

const getBookingStats = async ({ userId, userType }) => {
  const baseMatch = getSupplierBookingMatch({ userId, userType });

  const [
    totalBookings,
    pendingBookings,
    activeBookings,
    inProgressBookings,
    completedBookings,
    cancelledBookings,
  ] = await Promise.all([
    Booking.countDocuments(baseMatch),

    Booking.countDocuments({
      ...baseMatch,
      status: "pending",
    }),

    Booking.countDocuments({
      ...baseMatch,
      status: "active",
    }),

    Booking.countDocuments({
      ...baseMatch,
      status: "inProgress",
    }),

    Booking.countDocuments({
      ...baseMatch,
      status: "completed",
    }),

    Booking.countDocuments({
      ...baseMatch,
      status: {
        $in: ["cancelledByWorker", "cancelledByEmployer", "cancelledByUser"],
      },
    }),
  ]);

  return {
    totalBookings,
    pendingBookings,
    activeBookings,
    inProgressBookings,
    completedBookings,
    cancelledBookings,
  };
};

// ============================================================
// STAFF STATS
// ============================================================

const getStaffStats = async ({ userId }) => {
  const baseMatch = {
    user: userId,
    status: {
      $ne: "deleted",
    },
  };

  const [totalStaff, activeStaff, pendingStaff, inactiveStaff] =
    await Promise.all([
      Staff.countDocuments(baseMatch),

      Staff.countDocuments({
        ...baseMatch,
        status: "active",
      }),

      Staff.countDocuments({
        ...baseMatch,
        status: "pending",
      }),

      Staff.countDocuments({
        ...baseMatch,
        status: "inactive",
      }),
    ]);

  return {
    totalStaff,
    activeStaff,
    pendingStaff,
    inactiveStaff,
  };
};

// ============================================================
// BID STATS
// ============================================================

const getBidStats = async ({ userId }) => {
  /*
   * Bid.user is the agency/nurse who SUBMITTED the bid,
   * Bid.jobCreator is the customer who owns the job.
   *
   * The supplier is the bidder, so the supplier dashboard must use user.
   */

  const baseMatch = {
    user: userId,
    status: {
      $ne: "deleted",
    },
  };

  const [totalBids, pendingBids, acceptedBids, rejectedBids, withdrawnBids] =
    await Promise.all([
      Bid.countDocuments(baseMatch),

      Bid.countDocuments({
        ...baseMatch,
        status: "pending",
      }),

      Bid.countDocuments({
        ...baseMatch,
        status: "accepted",
      }),

      Bid.countDocuments({
        ...baseMatch,
        status: "rejected",
      }),

      Bid.countDocuments({
        ...baseMatch,
        status: "withdraw",
      }),
    ]);

  return {
    totalBids,
    pendingBids,
    acceptedBids,
    rejectedBids,
    withdrawnBids,
  };
};

// ============================================================
// BRANCHES ACTIVITY
// ============================================================

const getBranchesActivity = async ({ userId }) => {
  const branches = await Branches.find({
    user: userId,
    status: {
      $ne: "deleted",
    },
  })
    .sort({
      createdAt: -1,
    })
    .select(
      "_id name status location profileIcon cqc insurance rating createdAt updatedAt",
    )
    .lean();

  return branches.map((item) => ({
    id: item._id,

    type: "branch",

    title: "Branch activity",

    description: item.name,

    status: item.status,

    location: item.location || null,

    profileIcon: item.profileIcon || "",

    cqc: item.cqc || null,

    insurance: item.insurance || null,

    rating: item.rating || null,

    createdAt: item.createdAt,

    updatedAt: item.updatedAt,

    icon: "solar:buildings-2-bold",
  }));
};
// ============================================================
// MONTHLY ACTIVITY
// ============================================================

const getMonthlyActivity = async ({ userId, userType }) => {
  const months = 12;

  const [bookings, bids] = await Promise.all([
    // Bookings belonging to supplier's jobs
    getMonthlyAggregation({
      Model: Booking,

      match: getSupplierBookingMatch({ userId, userType }),

      months,
    }),
    // Bids by supplier
    getMonthlyAggregation({
      Model: Bid,

      match: {
        user: userId,
        status: {
          $ne: "deleted",
        },
      },

      months,
    }),
  ]);

  return {
    categories: getMonthlyCategories(months),

    series: [
      {
        name: "Bookings",
        data: bookings,
      },

      {
        name: "Bids",
        data: bids,
      },
    ],
  };
};

// ============================================================
// RECENT ACTIVITY
// ============================================================

const getRecentActivity = async ({ userId, jobMatch, userType }) => {
  const supplierJobMatch =
    jobMatch ||
    (await getSupplierJobMatch({
      userId,
      userType,
    }));

  const [jobs, bookings, bids, staff] = await Promise.all([
    // --------------------------------------------------------
    // Jobs
    // --------------------------------------------------------

    Job.find(supplierJobMatch)
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("_id name status createdAt"),

    // --------------------------------------------------------
    // Bookings
    // --------------------------------------------------------

    Booking.find(getSupplierBookingMatch({ userId, userType }))
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("_id status worker job shift createdAt"),

    // --------------------------------------------------------
    // Bids
    // --------------------------------------------------------

    Bid.find({
      user: userId,
      status: {
        $ne: "deleted",
      },
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("_id bid status job user createdAt"),

    // --------------------------------------------------------
    // Staff
    // --------------------------------------------------------

    Staff.find({
      user: userId,
      status: {
        $ne: "deleted",
      },
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("_id name status speciality createdAt"),
  ]);

  const activities = [
    // ========================================================
    // JOB ACTIVITY
    // ========================================================

    ...jobs.map((item) => ({
      id: item._id,
      type: "job",
      title: "Job",
      description: item.name,
      status: item.status,
      createdAt: item.createdAt,
      icon: "solar:case-round-bold",
    })),

    // ========================================================
    // BOOKING ACTIVITY
    // ========================================================

    ...bookings.map((item) => ({
      id: item._id,
      type: "booking",
      title: "Shift booking",
      description: `Booking status: ${item.status}`,
      status: item.status,
      createdAt: item.createdAt,
      icon: "solar:calendar-mark-bold",
    })),

    // ========================================================
    // BID ACTIVITY
    // ========================================================

    ...bids.map((item) => ({
      id: item._id,
      type: "bid",
      title: "Bid submitted",
      description: `Bid amount: ${item.bid}`,
      status: item.status,
      createdAt: item.createdAt,
      icon: "solar:tag-price-bold",
    })),

    // ========================================================
    // STAFF ACTIVITY
    // ========================================================

    ...staff.map((item) => ({
      id: item._id,
      type: "staff",
      title: "Staff added",
      description: item.name,
      status: item.status,
      createdAt: item.createdAt,
      icon: "solar:users-group-rounded-bold",
    })),
  ];

  return activities
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
};

// ============================================================
// NEW / OPEN JOB OPPORTUNITIES
// ============================================================

/*
 * A "new" job for a supplier is an open opportunity: somebody else's active
 * job that nobody has been assigned to yet and that still has a shift open
 * for bidding (unclaimed, biddable, not started) - not a job the supplier
 * already owns, and not one whose shifts are all in the past.
 *
 * The count and the list share this one filter, so the number shown above
 * the list can never disagree with the list itself.
 */
const getOpenJobMatch = ({ userId, now = new Date() }) => ({
  user: {
    $ne: userId,
  },

  status: "active",

  worker: null,

  employer: null,

  "shift.status": "pending",

  $expr: anyShiftExpr(openShiftExpr("s", now)),
});

const getNewJobsCount = async ({ userId }) =>
  Job.countDocuments(
    getOpenJobMatch({
      userId,
    }),
  );

const getOpenJobs = async ({ userId, timezone }) => {
  const now = new Date();

  const jobs = await Job.find(
    getOpenJobMatch({
      userId,
      now,
    }),
  )
    .sort({
      createdAt: -1,
    })
    .limit(5)
    .select("_id name location type shift createdAt")
    .lean();

  return jobs.map((job) => {
    const pendingShifts = Array.isArray(job.shift)
      ? job.shift
          .filter(
            (shift) =>
              shift?.status === "pending" &&
              shift?.isBiddingAllowed !== false &&
              shiftStartsAt(shift) > now,
          )
          .sort((a, b) => shiftStartsAt(a) - shiftStartsAt(b))
      : [];

    const nextShift = pendingShifts[0] || null;

    return {
      id: job._id,

      label: job.name,

      status: job.status,

      location: job.location || null,

      createdAt: job.createdAt,

      shift: nextShift
        ? (() => {
            const localShift = formatShiftToTimezone(nextShift, timezone);

            return {
              id: nextShift._id,
              date: localShift.date,
              startTime: localShift.startTime,
              endTime: localShift.endTime,
              allowedPersons: nextShift.allowedPersons,
              status: nextShift.status,
              isBreak: nextShift.isBreak,
              breakMin: nextShift.breakMin,
              isBiddingAllowed: nextShift.isBiddingAllowed,
            };
          })()
        : null,

      icon: "solar:case-round-bold",
    };
  });
};

// ============================================================
// WIN RATE BY REGION
// ============================================================

const getWinRateByRegion = async ({ userId }) => {
  const result = await Bid.aggregate([
    // --------------------------------------------------------
    // Only bids submitted by this supplier
    // --------------------------------------------------------

    {
      $match: {
        user: userId,
        status: {
          $ne: "deleted",
        },
      },
    },

    // --------------------------------------------------------
    // Get the job
    // --------------------------------------------------------

    {
      $lookup: {
        from: "jobs",
        localField: "job",
        foreignField: "_id",
        as: "job",
      },
    },

    {
      $unwind: "$job",
    },

    // --------------------------------------------------------
    // Group by country
    // --------------------------------------------------------

    {
      $group: {
        _id: {
          $ifNull: ["$job.location.country", "Unknown"],
        },

        totalBids: {
          $sum: 1,
        },

        wonBids: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", "accepted"],
              },
              1,
              0,
            ],
          },
        },
      },
    },

    // --------------------------------------------------------
    // Calculate percentage
    // --------------------------------------------------------

    {
      $project: {
        _id: 0,

        country: "$_id",

        totalBids: 1,

        wonBids: 1,

        winRate: {
          $cond: [
            {
              $gt: ["$totalBids", 0],
            },

            {
              $round: [
                {
                  $multiply: [
                    {
                      $divide: ["$wonBids", "$totalBids"],
                    },
                    100,
                  ],
                },
                2,
              ],
            },

            0,
          ],
        },
      },
    },

    // --------------------------------------------------------
    // Highest win rate first
    // --------------------------------------------------------

    {
      $sort: {
        winRate: -1,
      },
    },
  ]);

  return result;
};

// ============================================================
// SHIFTS & EARNINGS
// ============================================================

const getShiftsAndEarnings = async ({ userId, timezone, userType }) => {
  const bookings = await Booking.find({
    ...getSupplierBookingMatch({ userId, userType }),
    // status: {
    //   $in: ["active", "inProgress", "completed"],
    // },
    // status: "active"
  })
    .sort({
      "shift.date": -1,
    })
    .limit(50)
    .select("_id job worker status shift createdAt")
    .lean();

  return bookings.map((booking) => {
    const localShift = booking.shift
      ? formatShiftToTimezone(booking.shift, timezone)
      : null;

    return {
      id: booking._id,

      job: booking.job,

      worker: booking.worker,

      status: booking.status,

      shift: localShift
        ? {
            id: booking.shift._id,

            date: localShift.date,

            startTime: localShift.startTime,

            endTime: localShift.endTime,

            isBreak: booking.shift.isBreak,

            breakMin: booking.shift.breakMin,
          }
        : null,

      createdAt: booking.createdAt,
    };
  });
};

// ============================================================
// DASHBOARD
// ============================================================

const getSupplierDashboardStats = async ({ userId, timezone }) => {
  /*
   * userId may arrive as a string (?userId=...), and $match inside an
   * aggregation does not cast it the way countDocuments/find do.
   */
  userId = toObjectId(userId);

  /*
   * An agency and a nurse supply work in different shapes, so what counts as
   * their booking differs. Resolve it once, before anything queries.
   */
  const userType = await getDashboardUserType(userId);

  /*
   * Which jobs are the supplier's is one question - resolve it once and
   * share it, so the stats and the recent activity can never disagree.
   */
  const jobMatch = await getSupplierJobMatch({
    userId,
    userType,
  });

  const [
    jobs,
    bookings,
    staff,
    bids,
    monthlyActivity,
    recentActivity,
    branchesActivity,
    openJobs,
    newJobs,
    winRateByRegion,
    shiftsAndEarnings,
    earnings,
    earningsGraph,
  ] = await Promise.all([
    getJobStats({
      userId,
    }),

    getBookingStats({
      userId,
      userType,
    }),

    getStaffStats({
      userId,
    }),

    getBidStats({
      userId,
    }),

    getMonthlyActivity({
      userId,
      userType,
    }),

    getRecentActivity({
      userId,
      jobMatch,
      userType,
    }),

    getBranchesActivity({
      userId,
    }),

    getOpenJobs({
      userId,
      timezone,
    }),

    getNewJobsCount({
      userId,
    }),

    getWinRateByRegion({
      userId,
    }),

    getShiftsAndEarnings({
      userId,
      timezone,
      userType,
    }),

    getEarningsSummary({
      userId,
      userType,
      timezone,
    }),

    getEarningsGraph({
      userId,
      userType,
      timezone,
    }),
  ]);

  return {
    summary: {
      // Open opportunities to bid on - the same set the openJobs list shows.
      newJobs,
      activeBookings: bookings.activeBookings,

      totalStaff: staff.totalStaff,
      activeStaff: staff.activeStaff,
    },

    jobs: {
      total: jobs.totalJobs,
      active: jobs.activeJobs,
      inactive: jobs.inactiveJobs,
      completed: jobs.completedJobs,
    },

    bookings: {
      total: bookings.totalBookings,
      pending: bookings.pendingBookings,
      active: bookings.activeBookings,
      inProgress: bookings.inProgressBookings,
      completed: bookings.completedBookings,
      cancelled: bookings.cancelledBookings,
    },

    staff: {
      total: staff.totalStaff,
      active: staff.activeStaff,
      pending: staff.pendingStaff,
      inactive: staff.inactiveStaff,
    },

    bids: {
      total: bids.totalBids,
      pending: bids.pendingBids,
      accepted: bids.acceptedBids,
      rejected: bids.rejectedBids,
      withdrawn: bids.withdrawnBids,
    },

    monthlyActivity,

    recentActivity,

    branchesActivity,

    openJobs,

    winRateByRegion,

    shiftsAndEarnings,

    earnings,

    earningsGraph,
  };
};

module.exports = {
  getSupplierDashboardStats,

  getJobStats,
  getBookingStats,
  getStaffStats,
  getBidStats,

  getMonthlyActivity,
  getRecentActivity,
  getBranchesActivity,

  getOpenJobs,
  getNewJobsCount,
  getWinRateByRegion,
  getShiftsAndEarnings,
};
