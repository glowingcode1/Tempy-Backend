const Job = require("../../careHome/job/Job");
const Bid = require("../../aggency/bid/Bid");
const Staff = require("../../aggency/staff/Staff");
const Booking = require("../../careHome/booking/Booking");

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

// --------------------------------------------------
// STAFF STATS
// --------------------------------------------------

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
  const [jobs, bookings, bids, staff] = await Promise.all([
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
      employer: userId,
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
  ];

  return activities
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
};

// --------------------------------------------------
// DASHBOARD
// --------------------------------------------------

const getCustomerDashboardStats = async ({ userId }) => {
  const [jobs, bookings, staff, bids, monthlyActivity, recentActivity] =
    await Promise.all([
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
    ]);

  return {
    summary: {
      totalBookings: bookings.totalBookings,

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
  };
};

module.exports = {
  getCustomerDashboardStats,
  getJobStats,
  getBookingStats,
  getStaffStats,
  getBidStats,
  getMonthlyActivity,
  getRecentActivity,
};
