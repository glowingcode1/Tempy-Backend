const { getDateRanges } = require("./utils/dashboardDate.utils");
const mongoose = require("mongoose");
const { Bookings } = require("@BookingsModel");
const EngagementEvents = require("@appEngagement/EngagementEvents");
const { User } = require("@UsersModel");
const { calculateGrowth } = require("./utils/dashboardDate.utils");
const Review = require("../../../commonModules/reviews/Review");
const Conversation = require("../../../commonModules/chatModule/models/Conversation");
const Message = require("../../../commonModules/chatModule/models/Message");
const moment = require("moment-timezone");
const {
  getCoachAppearances,
} = require("../../../commonModules/searchSuggestions/searchSuggestionRepository");
const { getFullImageUrl } = require("@helperUtils/imageHelper");
const Subscription = require("../../../commonModules/subscription/Subscription");
const TasksModel = require("../../coach/tasks/TasksModel");
const { Services } = require("@ServicesModel");
const SupportRequest = require("@SupportRequestModel");
const CoachOnboardingResponses = require("../onboardingAndFilters/coachOnboardingResponses/CoachOnboardingResponsesModel");
const UsersOnboardingResponsesModel = require("@UsersOnboardingResponsesModel");

const getMonthlyRevenueComparison = async (coachId = null) => {
  const now = new Date();
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;

  const COMMISSION_RATE = 0.1; // 10% platform cut

  const getRevenueForYear = async (year) => {
    const start = new Date(`${year}-01-01T00:00:00.000Z`);
    const end = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const matchStage = {
      createdAt: { $gte: start, $lt: end },
      "payment.status": "succeeded",
    };

    if (coachId) matchStage.coach = new mongoose.Types.ObjectId(coachId);

    const result = await Bookings.aggregate([
      { $match: matchStage },
      {
        $project: {
          month: { $month: "$createdAt" },
          amount: { $multiply: ["$payment.amount", COMMISSION_RATE] },
        },
      },
      {
        $group: {
          _id: "$month",
          totalRevenue: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    return Array.from({ length: 12 }, (_, i) => {
      const monthData = result.find((r) => r._id === i + 1);
      return {
        month: i + 1,
        totalRevenue: monthData?.totalRevenue || 0,
      };
    });
  };

  const [thisYearRevenue, lastYearRevenue] = await Promise.all([
    getRevenueForYear(thisYear),
    getRevenueForYear(lastYear),
  ]);

  return { thisYearRevenue, lastYearRevenue };
};
const getSessions = async ({ timezone, user, dateFilter = "thisWeek" }) => {
  if (!user) {
    return {
      totalBookings: 0,
      thisWeekBookings: "0 this week",
      platformRevenue: 0,
      revenueGrowth: "0% vs last month",
    };
  }

  const coachId = new mongoose.Types.ObjectId(user);

  // ---- helper: count + revenue for a given date range (null = all time) ----
  const getStats = async (range) => {
    const matchStage = {
      ...(range ? { createdAt: { $gte: range.start, $lt: range.end } } : {}),
    };

    const count = await Bookings.countDocuments(matchStage);

    const revenueResult = await Bookings.aggregate([
      { $match: matchStage },
      { $group: { _id: null, totalAmount: { $sum: "$payment.amount" } } },
    ]);

    const revenue = revenueResult[0]?.totalAmount || 0;
    return { count, revenue };
  };

  // ---- date ranges ----
  const [weekRange, thisMonthRange, lastMonthRange] = await Promise.all([
    getDateRanges({ dateFilter: "thisWeek", timezone }),
    getDateRanges({ dateFilter: "thisMonth", timezone }),
    getDateRanges({ dateFilter: "lastMonth", timezone }),
  ]);

  // ---- queries ----
  const [allTime, thisWeek, thisMonth, lastMonth] = await Promise.all([
    getStats(null),
    getStats(weekRange),
    getStats(thisMonthRange),
    getStats(lastMonthRange),
  ]);

  // ---- platform fee = 10% of all bookings revenue ----
  const PLATFORM_FEE_RATE = 0.1;
  const platformRevenue = allTime.revenue * PLATFORM_FEE_RATE;

  // ---- month-over-month % change (on platform fee) ----
  const thisMonthFee = thisMonth.revenue * PLATFORM_FEE_RATE;
  const lastMonthFee = lastMonth.revenue * PLATFORM_FEE_RATE;

  let percentChange;
  if (lastMonthFee === 0) {
    percentChange = thisMonthFee > 0 ? 100 : 0; // avoid divide-by-zero
  } else {
    percentChange = ((thisMonthFee - lastMonthFee) / lastMonthFee) * 100;
  }

  const sign = percentChange >= 0 ? "+" : "";

  return {
    totalBookings: allTime.count,
    thisWeekBookings: "+" + thisWeek.count + " this week",
    platformRevenue: Math.round(platformRevenue * 100) / 100, // 2 decimals
    revenueGrowth: sign + percentChange.toFixed(1) + "% from last month",
  };
};

const BookingStatuses = [
  "pending",
  "confirmed",
  "rejected",
  "cancelled",
  "ongoing",
  "completed",
  "rescheduled",
  "deleted",
  "expired",
];

const getBookingStatusCounts = async (coachId = null) => {
  const matchStage = {};
  if (coachId) matchStage.coach = new mongoose.Types.ObjectId(coachId);

  const result = await Bookings.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$bookingStatus",
        count: { $sum: 1 },
      },
    },
  ]);

  // Map results for quick lookup
  const counts = result.reduce((acc, r) => {
    acc[r._id] = r.count;
    return acc;
  }, {});

  // Ensure every status is present, even if 0
  const byStatus = BookingStatuses.reduce((acc, status) => {
    acc[status] = counts[status] || 0;
    return acc;
  }, {});

  const total = Object.values(byStatus).reduce((sum, c) => sum + c, 0);

  return {
    total,
    byStatus,
  };
};

const Genders = ["Male", "Female", "Other"];

const getUserGenderCounts = async () => {
  // Group by gender within a single collection
  const groupByGender = async (Model) => {
    const result = await Model.aggregate([
      {
        $group: {
          _id: "$gender",
          count: { $sum: 1 },
        },
      },
    ]);
    return result.reduce((acc, r) => {
      // Treat "" (unset) as "Other"
      const key = r._id && r._id.trim() ? r._id : "Other";
      acc[key] = (acc[key] || 0) + r.count;
      return acc;
    }, {});
  };

  const [coachCounts, athleteCounts] = await Promise.all([
    groupByGender(CoachOnboardingResponses),
    groupByGender(UsersOnboardingResponsesModel),
  ]);

  // Merge the three buckets across both collections
  const byGender = Genders.reduce((acc, g) => {
    acc[g] = (coachCounts[g] || 0) + (athleteCounts[g] || 0);
    return acc;
  }, {});

  const total = Object.values(byGender).reduce((sum, c) => sum + c, 0);

  return {
    total,
    byGender,
  };
};
const getMonthlyUserGrowthComparison = async () => {
  const now = new Date();
  const thisYear = now.getFullYear();

  const getUserGrowthForType = async (userType) => {
    const start = new Date(`${thisYear}-01-01T00:00:00.000Z`);
    const end = new Date(`${thisYear + 1}-01-01T00:00:00.000Z`);

    const result = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lt: end },
          "accountState.status": "active",
          "accountState.userType": userType,
        },
      },
      {
        $project: {
          month: { $month: "$createdAt" },
        },
      },
      {
        $group: {
          _id: "$month",
          totalUsers: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // fill missing months with 0
    return Array.from({ length: 12 }, (_, i) => {
      const monthData = result.find((r) => r._id === i + 1);
      return {
        month: i + 1,
        totalUsers: monthData?.totalUsers || 0,
      };
    });
  };

  const [coaches, athletes] = await Promise.all([
    getUserGrowthForType("coach"),
    getUserGrowthForType("user"),
  ]);

  return {
    coachGrowth: coaches,
    athleteGrowth: athletes,
  };
};

const getTopCoaches = async (limit = 6) => {
  const result = await User.aggregate([
    // 1. Only coaches
    { $match: { "accountState.userType": "coach" } },

    // 2. Reviews for this coach -> avg rating + total reviews
    {
      $lookup: {
        from: "reviews",
        localField: "_id",
        foreignField: "objectUser",
        as: "reviews",
      },
    },
    {
      $addFields: {
        averageRating: { $avg: "$reviews.rating" },
        totalReviews: { $size: "$reviews" },
      },
    },

    // 3. Bookings -> count unique users who booked their services
    {
      $lookup: {
        from: "bookings",
        let: { coachId: "$_id" },
        pipeline: [
          { $match: { $expr: { $eq: ["$coach", "$$coachId"] } } },
          { $group: { _id: "$user" } }, // unique users
          { $count: "count" },
        ],
        as: "bookingStats",
      },
    },
    {
      $addFields: {
        uniqueClients: {
          $ifNull: [{ $arrayElemAt: ["$bookingStats.count", 0] }, 0],
        },
      },
    },

    // 4. Onboarding response -> priceRange
    {
      $lookup: {
        from: "coachonboardingresponses",
        localField: "_id",
        foreignField: "user",
        pipeline: [{ $project: { priceRange: 1 } }],
        as: "onboarding",
      },
    },
    {
      $addFields: {
        priceRange: { $arrayElemAt: ["$onboarding.priceRange", 0] },
      },
    },

    // 5. Sort by best coaches first
    { $sort: { averageRating: -1, totalReviews: -1, uniqueClients: -1, createdAt: -1 } },
    { $limit: limit },

    // 6. Return only the fields you asked for
    {
      $project: {
        _id: 0,
        user: {
          _id: "$_id",
          name: "$name",
          email: "$email",
          accountState: "$accountState",
          profileIcon: "$profileIcon",
        },
        averageRating: { $ifNull: ["$averageRating", 0] },
        totalReviews: 1,
        uniqueClients: 1,
        priceRange: 1,
      },
    },
  ]);

  return result.map((coach) => ({
    ...coach,
    user: {
      ...coach.user,
      profileIcon: getFullImageUrl(coach.user.profileIcon),
    },
  }));
};

const getStats = async ({ timezone, user, dateFilter = "thisMonth" }) => {
  const ranges = getDateRanges({ dateFilter, timezone });

  const getUserCount = async (role, range) => {
    const matchStage = {
      "accountState.status": "active",
      "accountState.userType": role, // 👈 adjust to your schema if needed (e.g. "accountState.accountType")
      ...(range ? { createdAt: { $gte: range.start, $lt: range.end } } : {}),
    };

    const result = await User.aggregate([
      { $match: matchStage },
      { $count: "count" },
    ]);

    return result[0]?.count || 0;
  };
  const [totalCoaches, coachesThisMonth, totalAthletes, athletesThisMonth] =
    await Promise.all([
      getUserCount("coach", null),
      getUserCount("coach", ranges),
      getUserCount("user", null),
      getUserCount("user", ranges),
    ]);

  return {
    totalCoaches,
    coachesThisMonth: "+" + coachesThisMonth + " this month",
    totalAthletes,
    athletesThisMonth: "+" + athletesThisMonth + " this month",
  };
};
const getRatingStats = async ({ timezone, user, dateFilter = "thisMonth" }) => {
  if (!user) {
    return {
      averageRating: 0,

      totalReviews: "0 this month",
    };
  }

  const matchStage = {
    rating: { $exists: true, $ne: null },
  };

  const result = await Review.aggregate([
    { $match: matchStage },

    {
      $group: {
        _id: null,

        averageRating: { $avg: "$rating" },

        totalReviews: { $count: {} },
      },
    },
  ]);
  const averageRating = result[0]?.averageRating || 0;

  const totalReviews = result[0]?.totalReviews || 0;

  return {
    averageRating: +averageRating.toFixed(2), // number

    totalReviews: `+${totalReviews} this month`, // string
  };
};


const getRecentUsers = async (limit = 10) => {
  const users = await User.find(
    {},
    {
      _id: 1,
      name: 1,
      email: 1,
      phoneNumber: 1,
      accountState: 1,
      profileIcon: 1,
      createdAt: 1,
    },
  )
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return users.map((user) => ({
    ...user,
    profileIcon: getFullImageUrl(user.profileIcon),
  }));
};












const getServicesCount = async () => {
  return Services.countDocuments({
    status: "active",
  }).exec();
};
const getOpenSupportTickets = async () => {
  return SupportRequest.countDocuments({
    status: "pending",
  }).exec();
};
const getServicesBookedCount = async () => {
  const services = await Bookings.distinct("service", {});
  return services.length;
};

const getRetentionRate = async (userType) => {
  const now = new Date();
  const startThisPeriod = new Date(now.getFullYear(), 0, 1);      // Jan 1 this year
  const startLastPeriod = new Date(now.getFullYear() - 1, 0, 1);  // Jan 1 last year

  const field = userType === "coach" ? "coach" : "user";

  const [lastPeriodActive, retained] = await Promise.all([
    Bookings.distinct(field, {
      createdAt: { $gte: startLastPeriod, $lt: startThisPeriod },
    }),
    Bookings.aggregate([
      { $match: { createdAt: { $gte: startLastPeriod } } },
      {
        $group: {
          _id: `$${field}`,
          periods: {
            $addToSet: {
              $cond: [
                { $gte: ["$createdAt", startThisPeriod] },
                "this",
                "last",
              ],
            },
          },
        },
      },
      { $match: { periods: { $all: ["this", "last"] } } },
      { $count: "count" },
    ]),
  ]);

  const base = lastPeriodActive.length;
  const stayed = retained[0]?.count || 0;
  return base > 0 ? Math.round((stayed / base) * 100) : 0;
};

const getPlatformMetrics = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const PLATFORM_TAKE_RATE = 0.1; // 10% — config constant

  const [revenueAgg, ratingAgg, sessionsAgg, coachCount, ticketAgg] =
    await Promise.all([
      // Avg Revenue / Coach (this month, gross booking amount per coach)
      Bookings.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfMonth },
            "payment.status": "paid",
          },
        },
        {
          $group: { _id: "$coach", coachRevenue: { $sum: "$payment.amount" } },
        },
        { $group: { _id: null, avgRevenue: { $avg: "$coachRevenue" } } },
      ]),

      // Avg Coach Rating (overall average across all reviews)
      Review.aggregate([
        { $group: { _id: null, avgRating: { $avg: "$rating" } } },
      ]),

      // Avg Sessions / Athlete / week (bookings in last 7 days ÷ distinct athletes)
      Bookings.aggregate([
        { $unwind: "$weeklySlots" },
        { $unwind: "$weeklySlots.slots" },
        {
          $group: {
            _id: null,
            totalSessions: { $sum: 1 },
            athletes: { $addToSet: "$user" },
          },
        },
        {
          $project: {
            avgSessions: {
              $cond: [
                { $gt: [{ $size: "$athletes" }, 0] },
                { $divide: ["$totalSessions", { $size: "$athletes" }] },
                0,
              ],
            },
          },
        },
      ]),

      // Coach count (for the revenue average denominator sanity / display)
      User.countDocuments({ userType: "coach" }),

      // Support tickets — assumes a SupportTickets collection exists
      SupportRequest.aggregate([
        {
          $group: {
            _id: null,
            openTickets: {
              $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
            },
            avgResolveHours: {
              $avg: {
                $cond: [
                  { $eq: ["$status", "closed"] },
                  {
                    $divide: [
                      { $subtract: ["$updatedAt", "$createdAt"] },
                      1000 * 60 * 60, // ms → hours
                    ],
                  },
                  null,
                ],
              },
            },
          },
        },
      ]),
    ]);

  const avgRevenuePerCoach = revenueAgg[0]?.avgRevenue || 0;
  const avgCoachRating = ratingAgg[0]?.avgRating || 0;
  const avgSessionsPerAthlete = sessionsAgg[0]?.avgSessions || 0;
  const openTickets = ticketAgg[0]?.openTickets || 0;
  const avgResolveHours = ticketAgg[0]?.avgResolveHours || 0;

  // Retention — see note below, needs a real definition
  const [coachRetention, athleteRetention] = await Promise.all([
    getRetentionRate("coach"),
    getRetentionRate("user"),
  ]);

  return {
    avgRevenuePerCoach: Math.round(avgRevenuePerCoach),
    platformTakeRate: PLATFORM_TAKE_RATE*100,
    avgCoachRating: Number(avgCoachRating.toFixed(1)),
    avgSessionsPerAthlete: Number(avgSessionsPerAthlete.toFixed(1)),
    coachRetentionRate: coachRetention,
    athleteRetentionRate: athleteRetention,
    openTickets,
    avgTicketResolveHours: Number(avgResolveHours.toFixed(1)),
  };
};

module.exports = {
  getStats,
  getSessions,
  getRatingStats,
  getServicesCount,
  getServicesBookedCount,
  getMonthlyRevenueComparison,
  getBookingStatusCounts,
  getUserGenderCounts,
  getMonthlyUserGrowthComparison,
  getTopCoaches,
  getRecentUsers,
  getOpenSupportTickets,
  getPlatformMetrics,
};
