const Job = require("../../careHome/job/Job");
const Bid = require("../bid/Bid");
const Staff = require("../staff/Staff");
const Booking = require("../../careHome/booking/Booking");
const Branches = require("../../aggency/branches/Branches");
const mongoose = require("mongoose");
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

/*
 * A Job is always created by the CUSTOMER (careHome / hospital / user),
 * so Job.user is never the supplier. The supplier side of a job is:
 *
 *   - jobs the supplier has bid on   -> Bid.user = supplier
 *   - jobs assigned directly to them -> Job.employer = supplier
 */
const getSupplierJobMatch = async ({ userId }) => {
  const jobIds = await Bid.distinct("job", {
    user: userId,
    status: {
      $ne: "deleted",
    },
  });

  return {
    $or: [
      {
        _id: {
          $in: jobIds,
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

const getJobStats = async ({ userId }) => {
  const baseMatch = await getSupplierJobMatch({
    userId,
  });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalJobs, activeJobs, inactiveJobs, completedJobs, newJobs] =
    await Promise.all([
      Job.countDocuments(baseMatch),

      Job.countDocuments({
        ...baseMatch,
        status: "active",
      }),

      Job.countDocuments({
        ...baseMatch,
        status: "inactive",
      }),

      Job.countDocuments({
        ...baseMatch,
        status: "completed",
      }),

      Job.countDocuments({
        ...baseMatch,
        createdAt: {
          $gte: thirtyDaysAgo,
        },
      }),
    ]);

  return {
    totalJobs,
    activeJobs,
    inactiveJobs,
    completedJobs,
    newJobs,
  };
};

// ============================================================
// BOOKING STATS
// ============================================================

const getBookingStats = async ({ userId }) => {
  const baseMatch = {
    employer: userId,
  };

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

const getMonthlyActivity = async ({ userId }) => {
  const months = 12;

  const [bookings, bids] = await Promise.all([
    // Bookings belonging to supplier's jobs
    getMonthlyAggregation({
      Model: Booking,

      match: {
        employer: userId,
      },

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

const getRecentActivity = async ({ userId }) => {
  const supplierJobMatch = await getSupplierJobMatch({
    userId,
  });

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

    Booking.find({
      employer: userId,
    })
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
// OPEN JOB OPPORTUNITIES
// ============================================================

// ============================================================
// OPEN JOB OPPORTUNITIES
// ============================================================

const getOpenJobs = async ({ userId, timezone }) => {
  /*
   * Open opportunities for a supplier are unassigned customer jobs
   * that still have a pending shift - not jobs the supplier owns.
   */
  const jobs = await Job.find({
    user: {
      $ne: userId,
    },

    status: "active",

    worker: null,

    employer: null,

    "shift.status": "pending",
  })
    .sort({
      createdAt: -1,
    })
    .limit(5)
    .select("_id name location type shift createdAt")
    .lean();

  return jobs.map((job) => {
    const pendingShifts = Array.isArray(job.shift)
      ? job.shift
          .filter((shift) => shift?.status === "pending" && shift?.date)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
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

const getShiftsAndEarnings = async ({ userId, timezone }) => {
  const bookings = await Booking.find({
    employer: userId,
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

      // Earnings intentionally omitted for now.
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

  const [
    jobs,
    bookings,
    staff,
    bids,
    monthlyActivity,
    recentActivity,
    branchesActivity,
    openJobs,
    winRateByRegion,
    shiftsAndEarnings,
  ] = await Promise.all([
    getJobStats({
      userId,
    }),

    getBookingStats({
      userId,
    }),

    getStaffStats({
      userId,
    }),

    getBidStats({
      userId,
    }),

    getMonthlyActivity({
      userId,
    }),

    getRecentActivity({
      userId,
    }),

    getBranchesActivity({
      userId,
    }),

    getOpenJobs({
      userId,
      timezone,
    }),

    getWinRateByRegion({
      userId,
    }),

    getShiftsAndEarnings({
      userId,
      timezone,
    }),
  ]);

  return {
    summary: {
      newJobs: jobs.newJobs,
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
  getWinRateByRegion,
  getShiftsAndEarnings,
};
