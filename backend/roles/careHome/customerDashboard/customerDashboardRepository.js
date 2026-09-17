const Job = require("../../careHome/job/Job");
const Bid = require("../../aggency/bid/Bid");
const Staff = require("../../aggency/staff/Staff");
const {
  countCustomerStaffByStatus,
} = require("../../aggency/staff/staffRepository");
const Booking = require("../../careHome/booking/Booking");
const Branches = require("../../aggency/branches/Branches");

// --------------------------------------------------
// MONTH HELPERS
// --------------------------------------------------

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

// --------------------------------------------------
// MONTHLY AGGREGATION
// --------------------------------------------------

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

// --------------------------------------------------
// JOB STATS
// --------------------------------------------------

const getJobStats = async ({ userId }) => {
  const baseMatch = {
    user: userId,
    status: {
      $ne: "deleted",
    },
  };

  const [totalJobs, activeJobs, inactiveJobs, completedJobs] =
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
    ]);

  return {
    totalJobs,
    activeJobs,
    inactiveJobs,
    completedJobs,
  };
};

// --------------------------------------------------
// BOOKING STATS
// --------------------------------------------------

const getBookingStats = async ({ userId }) => {
  const baseMatch = {
    $or: [{ employer: userId }, { user: userId }],
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

// --------------------------------------------------
// BRANCHES STATS
// --------------------------------------------------

const getBranchStats = async ({ userId }) => {
  const baseMatch = {
    user: userId,
    status: {
      $ne: "deleted",
    },
  };

  const [totalBranches, activeBranches, inactiveBranches, pendingBranches] =
    await Promise.all([
      Branches.countDocuments(baseMatch),

      Branches.countDocuments({
        ...baseMatch,
        status: "active",
      }),

      Branches.countDocuments({
        ...baseMatch,
        status: "inactive",
      }),

      Branches.countDocuments({
        ...baseMatch,
        status: "pending",
      }),
    ]);

  return {
    totalBranches,
    activeBranches,
    inactiveBranches,
    pendingBranches,
  };
};

// --------------------------------------------------
// STAFF STATS
// --------------------------------------------------

/*
 * A customer employs no staff of its own: its staff are the workers booked on
 * its jobs. Counted exactly as the customer's staff list counts them.
 */
const getStaffStats = async ({ userId }) => {
  const counts = await countCustomerStaffByStatus(userId);

  return {
    totalStaff: counts.total,
    activeStaff: counts.active,
    pendingStaff: counts.pending,
    inactiveStaff: counts.inactive,
  };
};

// --------------------------------------------------
// BID STATS
// --------------------------------------------------

const getBidStats = async ({ userId }) => {
  /*
   * jobCreator is the customer who owns the job.
   * Therefore customer dashboard should use jobCreator.
   */

  const baseMatch = {
    jobCreator: userId,
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

// --------------------------------------------------
// MONTHLY ACTIVITY
// --------------------------------------------------

const getMonthlyActivity = async ({ userId }) => {
  const months = 12;

  const [jobs, bid] = await Promise.all([
    getMonthlyAggregation({
      Model: Job,

      match: {
        user: userId,
        status: {
          $ne: "deleted",
        },
      },

      months,
    }),

    getMonthlyAggregation({
      Model: Bid,

      match: {
        jobCreator: userId,
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
        name: "Jobs",
        data: jobs,
      },

      {
        name: "Bids",
        data: bid,
      },
    ],
  };
};

// --------------------------------------------------
// RECENT ACTIVITY
// --------------------------------------------------

const getRecentActivity = async ({ userId }) => {
  const [jobs, bookings, bids, staff, branches] = await Promise.all([
    Job.find({
      user: userId,
      status: {
        $ne: "deleted",
      },
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("name status createdAt"),

    Booking.find({
      $or: [{ employer: userId }, { user: userId }],
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("status worker job shift createdAt"),

    Bid.find({
      jobCreator: userId,
      status: {
        $ne: "deleted",
      },
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("bid status job user createdAt"),

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
      .select("name status speciality createdAt"),

    Branches.find({
      user: userId,
      status: {
        $ne: "deleted",
      },
    })
      .sort({
        createdAt: -1,
      })
      .limit(5)
      .select("name status location rating createdAt"),
  ]);

  const activities = [
    ...jobs.map((item) => ({
      id: item._id,
      type: "job",
      title: "Job created",
      description: item.name,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...bookings.map((item) => ({
      id: item._id,
      type: "booking",
      title: "Shift booking",
      description: `Booking status: ${item.status}`,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...bids.map((item) => ({
      id: item._id,
      type: "bid",
      title: "New bid received",
      description: `Bid amount: ${item.bid}`,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...staff.map((item) => ({
      id: item._id,
      type: "staff",
      title: "Staff added",
      description: item.name,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...branches.map((item) => ({
      id: item._id,
      type: "branch",
      title: "Branch added",
      description: item.name,
      status: item.status,
      createdAt: item.createdAt,
    })),
  ];

  return activities
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
};

// --------------------------------------------------
// BRANCHES ACTIVITY
// --------------------------------------------------

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
      "name status location profileIcon cqc insurance rating createdAt updatedAt",
    )
    .lean();

  return branches.map((item) => ({
    id: item._id,
    type: "branch",
    title: "Branch activity",
    description: item.name,
    status: item.status,
    location: item.location,
    profileIcon: item.profileIcon,
    cqc: item.cqc,
    insurance: item.insurance,
    rating: item.rating,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
};

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

const getCustomerDashboardStats = async ({ userId }) => {
  const [
    jobs,
    bookings,
    staff,
    bids,
    branches,
    monthlyActivity,
    recentActivity,
    branchesActivity,
  ] = await Promise.all([
    getJobStats({ userId }),
    getBookingStats({ userId }),
    getStaffStats({ userId }),
    getBidStats({ userId }),
    getBranchStats({ userId }),
    getMonthlyActivity({ userId }),
    getRecentActivity({ userId }),
    getBranchesActivity({ userId }),
  ]);

  return {
    summary: {
      totalJobs: jobs.totalJobs,
      activeJobs: jobs.activeJobs,
      totalBookings: bookings.totalBookings,
      activeStaff: staff.activeStaff,
      totalBranches: branches.totalBranches,
      activeBranches: branches.activeBranches,
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

    branches: {
      total: branches.totalBranches,
      active: branches.activeBranches,
      inactive: branches.inactiveBranches,
      pending: branches.pendingBranches,
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
  };
};

module.exports = {
  getCustomerDashboardStats,
  getJobStats,
  getBookingStats,
  getStaffStats,
  getBidStats,
  getBranchStats,
  getMonthlyActivity,
  getRecentActivity,
  getBranchesActivity,
};
