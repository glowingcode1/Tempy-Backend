const mongoose = require("mongoose");

const { User, customerTypes, supplierTypes } = require("@UsersModel");

const Job = require("../../careHome/job/Job");
const Bid = require("../../aggency/bid/Bid");
const Staff = require("../../aggency/staff/Staff");
const Booking = require("../../careHome/booking/Booking");

// --------------------------------------------------
// Helpers
// --------------------------------------------------

const getMonthRange = (months = 12) => {
  const now = new Date();

  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1),
  );

  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return { start, end };
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

  const now = new Date();

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
// USER STATS
// --------------------------------------------------

const getUserStats = async () => {
  const baseMatch = {
    "accountState.status": {
      $ne: "deleted",
    },
    "verificationStatus.email": "verified",
  };

  const [
    totalUsers,
    activeUsers,
    pendingUsers,
    customerCount,
    supplierCount,
    usersByType,
  ] = await Promise.all([
    User.countDocuments(baseMatch),

    User.countDocuments({
      ...baseMatch,
      "accountState.status": "active",
    }),

    User.countDocuments({
      "accountState.status": "pending",
    }),

    User.countDocuments({
      ...baseMatch,
      "accountState.userType": {
        $in: customerTypes,
      },
    }),

    User.countDocuments({
      ...baseMatch,
      "accountState.userType": {
        $in: supplierTypes,
      },
    }),

    User.aggregate([
      {
        $match: baseMatch,
      },

      {
        $group: {
          _id: "$accountState.userType",
          count: {
            $sum: 1,
          },
        },
      },

      {
        $sort: {
          count: -1,
        },
      },
    ]),
  ]);

  const customerTypeNames = {
    careHome: "Care Home",
    hospital: "Hospital",
    localAuthority: "Local Authority",
    user: "Individual",
  };

  const supplierTypeNames = {
    agency: "Agency",
    homeCareCompany: "Home Care Company",
    nurse: "Nurse",
  };

  const usersByTypeFormatted = usersByType.map((item) => ({
    label:
      customerTypeNames[item._id] ||
      supplierTypeNames[item._id] ||
      item._id,
    value: item.count,
    userType: item._id,
  }));

  return {
    totalUsers,
    activeUsers,
    pendingUsers,
    customerCount,
    supplierCount,
    usersByType: usersByTypeFormatted,
  };
};

// --------------------------------------------------
// JOB STATS
// --------------------------------------------------

const getJobStats = async () => {
  const baseMatch = {
    status: {
      $ne: "deleted",
    },
  };

  const [
    totalJobs,
    activeJobs,
    completedJobs,
    inactiveJobs,
    jobStatusAggregation,
  ] = await Promise.all([
    Job.countDocuments(baseMatch),

    Job.countDocuments({
      ...baseMatch,
      status: "active",
    }),

    Job.countDocuments({
      ...baseMatch,
      status: "completed",
    }),

    Job.countDocuments({
      ...baseMatch,
      status: "inactive",
    }),

    Job.aggregate([
      {
        $match: baseMatch,
      },

      {
        $group: {
          _id: "$status",
          count: {
            $sum: 1,
          },
        },
      },
    ]),
  ]);

  /*
   * Your Job schema does not have a "filled" status.
   *
   * Therefore we determine filled jobs from bookings.
   */
  const filledJobsAggregation = await Booking.aggregate([
    {
      $match: {
        status: {
          $in: [
            "pending",
            "active",
            "inProgress",
            "completed",
          ],
        },
      },
    },

    {
      $group: {
        _id: "$job",
      },
    },

    {
      $count: "count",
    },
  ]);

  const filledJobs = filledJobsAggregation[0]?.count || 0;

  const openJobs = Math.max(activeJobs - filledJobs, 0);

  return {
    totalJobs,
    activeJobs,
    completedJobs,
    inactiveJobs,

    status: [
      {
        label: "Open",
        value: openJobs,
      },
      {
        label: "Filled",
        value: filledJobs,
      },
      {
        label: "Closed",
        value: completedJobs + inactiveJobs,
      },
    ],
  };
};

// --------------------------------------------------
// BID STATS
// --------------------------------------------------

const getBidStats = async () => {
  const [
    totalBids,
    openBids,
    acceptedBids,
    rejectedBids,
    withdrawnBids,
  ] = await Promise.all([
    Bid.countDocuments({
      status: {
        $ne: "deleted",
      },
    }),

    Bid.countDocuments({
      status: "pending",
    }),

    Bid.countDocuments({
      status: "accepted",
    }),

    Bid.countDocuments({
      status: "rejected",
    }),

    Bid.countDocuments({
      status: "withdraw",
    }),
  ]);

  return {
    totalBids,
    openBids,
    acceptedBids,
    rejectedBids,
    withdrawnBids,
  };
};

// --------------------------------------------------
// BOOKING / FULFILMENT STATS
// --------------------------------------------------

const getBookingStats = async () => {
  const [
    totalBookings,
    activeBookings,
    inProgressBookings,
    completedBookings,
    cancelledBookings,
  ] = await Promise.all([
    Booking.countDocuments(),

    Booking.countDocuments({
      status: "active",
    }),

    Booking.countDocuments({
      status: "inProgress",
    }),

    Booking.countDocuments({
      status: "completed",
    }),

    Booking.countDocuments({
      status: {
        $in: [
          "cancelledByWorker",
          "cancelledByEmployer",
          "cancelledByUser",
        ],
      },
    }),
  ]);

  const totalFinished =
    completedBookings + cancelledBookings;

  const fillRate =
    totalBookings > 0
      ? Number(
          (
            ((completedBookings + inProgressBookings) /
              totalBookings) *
            100
          ).toFixed(2),
        )
      : 0;

  const completionRate =
    totalBookings > 0
      ? Number(
          (
            (completedBookings / totalBookings) *
            100
          ).toFixed(2),
        )
      : 0;

  return {
    totalBookings,
    activeBookings,
    inProgressBookings,
    completedBookings,
    cancelledBookings,
    fillRate,
    completionRate,
    totalFinished,
  };
};

// --------------------------------------------------
// STAFF STATS
// --------------------------------------------------

const getStaffStats = async () => {
  const [
    totalStaff,
    activeStaff,
    pendingStaff,
    inactiveStaff,
  ] = await Promise.all([
    Staff.countDocuments({
      status: {
        $ne: "deleted",
      },
    }),

    Staff.countDocuments({
      status: "active",
    }),

    Staff.countDocuments({
      status: "pending",
    }),

    Staff.countDocuments({
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
// MONTHLY ACTIVITY
// --------------------------------------------------

const getMonthlyActivity = async () => {
  const months = 12;

  const [jobs, bids, bookings] = await Promise.all([
    getMonthlyAggregation({
      Model: Job,
      match: {
        status: {
          $ne: "deleted",
        },
      },
      months,
    }),

    getMonthlyAggregation({
      Model: Bid,
      match: {
        status: {
          $ne: "deleted",
        },
      },
      months,
    }),

    getMonthlyAggregation({
      Model: Booking,
      match: {},
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
        data: bids,
      },
      {
        name: "Filled Shifts",
        data: bookings,
      },
    ],
  };
};

// --------------------------------------------------
// CUSTOMER / SUPPLIER GROWTH
// --------------------------------------------------

const getUserGrowth = async () => {
  const months = 12;
  const { start, end } = getMonthRange(months);

  const baseMatch = {
    "accountState.status": {
      $ne: "deleted",
    },
    "verificationStatus.email": "verified",
    createdAt: {
      $gte: start,
      $lt: end,
    },
  };

  const result = await User.aggregate([
    {
      $match: baseMatch,
    },

    {
      $group: {
        _id: {
          year: {
            $year: "$createdAt",
          },
          month: {
            $month: "$createdAt",
          },
        },

        customers: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$accountState.userType",
                  customerTypes,
                ],
              },
              1,
              0,
            ],
          },
        },

        suppliers: {
          $sum: {
            $cond: [
              {
                $in: [
                  "$accountState.userType",
                  supplierTypes,
                ],
              },
              1,
              0,
            ],
          },
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

  const customers = new Array(months).fill(0);
  const suppliers = new Array(months).fill(0);

  result.forEach((item) => {
    const index =
      (item._id.year - start.getUTCFullYear()) * 12 +
      (item._id.month - 1 - start.getUTCMonth());

    if (index >= 0 && index < months) {
      customers[index] = item.customers;
      suppliers[index] = item.suppliers;
    }
  });

  return {
    categories: getMonthlyCategories(months),
    customers,
    suppliers,
  };
};

// --------------------------------------------------
// REGIONAL FILL RATES
// --------------------------------------------------

const getRegionalFillRates = async () => {
  const result = await Booking.aggregate([
    {
      $match: {
        "snapshot.location": {
          $exists: true,
        },
      },
    },

    {
      $group: {
        _id: "$snapshot.location.city",

        total: {
          $sum: 1,
        },

        completed: {
          $sum: {
            $cond: [
              {
                $eq: ["$status", "completed"],
              },
              1,
              0,
            ],
          },
        },
      },
    },

    {
      $match: {
        "_id": {
          $ne: null,
        },
      },
    },

    {
      $project: {
        _id: 0,
        region: "$_id",
        fillRate: {
          $cond: [
            {
              $gt: ["$total", 0],
            },
            {
              $multiply: [
                {
                  $divide: [
                    "$completed",
                    "$total",
                  ],
                },
                100,
              ],
            },
            0,
          ],
        },
      },
    },

    {
      $sort: {
        fillRate: -1,
      },
    },

    {
      $limit: 10,
    },
  ]);

  return {
    categories: result.map((item) => item.region),
    series: [
      {
        name: "Fill Rate",
        data: result.map((item) =>
          Number(item.fillRate.toFixed(2)),
        ),
      },
    ],
  };
};

// --------------------------------------------------
// PLATFORM HEALTH
// --------------------------------------------------

const getPlatformHealth = async ({
  users,
  jobs,
  bids,
  bookings,
  staff,
}) => {
  const health = [
    users.totalUsers > 0
      ? (users.activeUsers / users.totalUsers) * 100
      : 0,

    jobs.totalJobs > 0
      ? (jobs.activeJobs / jobs.totalJobs) * 100
      : 0,

    bids.totalBids > 0
      ? (bids.acceptedBids / bids.totalBids) * 100
      : 0,

    bookings.totalBookings > 0
      ? (bookings.completedBookings /
          bookings.totalBookings) *
        100
      : 0,

    staff.totalStaff > 0
      ? (staff.activeStaff / staff.totalStaff) * 100
      : 0,
  ];

  return {
    labels: [
      "User Activity",
      "Job Activity",
      "Bid Acceptance",
      "Booking Completion",
      "Staff Activity",
    ],

    series: health.map((value) =>
      Number(Math.min(value, 100).toFixed(2)),
    ),
  };
};

// --------------------------------------------------
// TIMELINE
// --------------------------------------------------

const getEventTimeline = async () => {
  const [jobs, bids, bookings, users] = await Promise.all([
    Job.find({
      status: {
        $ne: "deleted",
      },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name createdAt status"),

    Bid.find({
      status: {
        $ne: "deleted",
      },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("bid status createdAt"),

    Booking.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("status createdAt"),

    User.find({
      "accountState.status": {
        $ne: "deleted",
      },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name accountState.userType createdAt"),
  ]);

  const timeline = [
    ...jobs.map((item) => ({
      id: item._id,
      type: "job",
      title: "Job created",
      description: item.name,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...bids.map((item) => ({
      id: item._id,
      type: "bid",
      title: "Bid submitted",
      description: `Bid amount: ${item.bid}`,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...bookings.map((item) => ({
      id: item._id,
      type: "booking",
      title: "Booking activity",
      description: `Booking status: ${item.status}`,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...users.map((item) => ({
      id: item._id,
      type: "user",
      title: "New account",
      description: item.name || "New user",
      userType: item.accountState?.userType,
      createdAt: item.createdAt,
    })),
  ];

  return timeline
    .sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt),
    )
    .slice(0, 10);
};

// --------------------------------------------------
// TOP PERFORMERS
// --------------------------------------------------

const getTopPerformers = async () => {
  const result = await Booking.aggregate([
    {
      $match: {
        worker: {
          $ne: null,
        },
        status: "completed",
      },
    },

    {
      $group: {
        _id: "$worker",
        completedBookings: {
          $sum: 1,
        },
      },
    },

    {
      $sort: {
        completedBookings: -1,
      },
    },

    {
      $limit: 5,
    },

    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "worker",
      },
    },

    {
      $unwind: {
        path: "$worker",
        preserveNullAndEmptyArrays: true,
      },
    },

    {
      $project: {
        _id: 1,
        name: "$worker.name",
        email: "$worker.email",
        userType: "$worker.accountState.userType",
        completedBookings: 1,
      },
    },
  ]);

  return result;
};

// --------------------------------------------------
// RECENT ACTIVITY
// --------------------------------------------------

const getRecentActivity = async () => {
  const [users, jobs, bids, bookings] = await Promise.all([
    User.find({
      "accountState.status": {
        $ne: "deleted",
      },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name email accountState.userType createdAt"),

    Job.find({
      status: {
        $ne: "deleted",
      },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name status createdAt"),

    Bid.find({
      status: {
        $ne: "deleted",
      },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("status bid createdAt"),

    Booking.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("status createdAt"),
  ]);

  const activities = [
    ...users.map((item) => ({
      id: item._id,
      type: "user",
      title: "New user registered",
      description:
        item.name || item.email,
      status:
        item.accountState?.status || "pending",
      createdAt: item.createdAt,
    })),

    ...jobs.map((item) => ({
      id: item._id,
      type: "job",
      title: "Job created",
      description: item.name,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...bids.map((item) => ({
      id: item._id,
      type: "bid",
      title: "New bid",
      description: `Bid amount: ${item.bid}`,
      status: item.status,
      createdAt: item.createdAt,
    })),

    ...bookings.map((item) => ({
      id: item._id,
      type: "booking",
      title: "Booking updated",
      description: "Shift booking activity",
      status: item.status,
      createdAt: item.createdAt,
    })),
  ];

  return activities
    .sort(
      (a, b) =>
        new Date(b.createdAt) -
        new Date(a.createdAt),
    )
    .slice(0, 10);
};

// --------------------------------------------------
// DASHBOARD REPOSITORY
// --------------------------------------------------

const getDashboardStats = async () => {
  const [
    users,
    jobs,
    bids,
    bookings,
    staff,
    monthlyActivity,
    growth,
    regionalFillRates,
    timeline,
    topPerformers,
    recentActivity,
  ] = await Promise.all([
    getUserStats(),
    getJobStats(),
    getBidStats(),
    getBookingStats(),
    getStaffStats(),
    getMonthlyActivity(),
    getUserGrowth(),
    getRegionalFillRates(),
    getEventTimeline(),
    getTopPerformers(),
    getRecentActivity(),
  ]);

  const platformHealth = await getPlatformHealth({
    users,
    jobs,
    bids,
    bookings,
    staff,
  });

  return {
    summary: {
      totalUsers: users.totalUsers,
      activeUsers: users.activeUsers,
      activeJobs: jobs.activeJobs,
      openBids: bids.openBids,
    },

    users: {
      total: users.totalUsers,
      active: users.activeUsers,
      pending: users.pendingUsers,
      customers: users.customerCount,
      suppliers: users.supplierCount,
    },

    usersByType: {
      series: users.usersByType,
    },

    jobStatus: {
      series: jobs.status,
    },

    customerSupplier: {
      series: [
        {
          label: "Customers",
          value: users.customerCount,
        },
        {
          label: "Suppliers",
          value: users.supplierCount,
        },
      ],
    },

    jobs: {
      total: jobs.totalJobs,
      active: jobs.activeJobs,
      completed: jobs.completedJobs,
      inactive: jobs.inactiveJobs,
    },

    bids: {
      total: bids.totalBids,
      open: bids.openBids,
      accepted: bids.acceptedBids,
      rejected: bids.rejectedBids,
      withdrawn: bids.withdrawnBids,
    },

    bookings: {
      total: bookings.totalBookings,
      active: bookings.activeBookings,
      inProgress: bookings.inProgressBookings,
      completed: bookings.completedBookings,
      cancelled: bookings.cancelledBookings,
      fillRate: bookings.fillRate,
      completionRate: bookings.completionRate,
    },

    staff: {
      total: staff.totalStaff,
      active: staff.activeStaff,
      pending: staff.pendingStaff,
      inactive: staff.inactiveStaff,
    },

    monthlyActivity,

    growth,

    regionalFillRates,

    platformHealth,

    timeline,

    topPerformers,

    recentActivity,
  };
};

module.exports = {
  getDashboardStats,
  getUserStats,
  getJobStats,
  getBidStats,
  getBookingStats,
  getStaffStats,
  getMonthlyActivity,
  getUserGrowth,
  getRegionalFillRates,
  getPlatformHealth,
  getEventTimeline,
  getTopPerformers,
  getRecentActivity,
};
