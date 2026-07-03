const dashboardRepo = require("./dashboardRepository");
const { calculateGrowth } = require("./utils/dashboardDate.utils");
const { DASHBOARD_KEYS, withSubFilters } = require("./utils/dashboardKeyMap");

const { buildRevenueOverTime } = require("./utils/buildRevenueOverTime");
const { buildUserGrowthOverTime } = require("./utils/buildUserGrowthOverTime");


/**
 * DASHBOARD – Load all cards at once
 */
const getDashboard = async ({ timezone, user }) => {
  const promises = [
    dashboardRepo.getStats({ timezone, user }),
    dashboardRepo.getSessions({ timezone, user }),
    dashboardRepo.getRatingStats({ timezone, user }),
    dashboardRepo.getServicesCount(),
    dashboardRepo.getServicesBookedCount(),
    dashboardRepo.getOpenSupportTickets(),
    getRevenueOverTimeService(),
    dashboardRepo.getBookingStatusCounts(),
    dashboardRepo.getUserGenderCounts(),
    getMonthlyUserGrowthComparison(),
    dashboardRepo.getTopCoaches(),
    dashboardRepo.getRecentUsers(),
    dashboardRepo.getPlatformMetrics(),
  ];

  const [
    stats,
    sessions,
    ratingStats,
    servicesCount,
    servicesBookedCount,
    openSupportTickets,
    PlatFormRevenueOverTime,
    bookingStatusCounts,
    userDamographics,
    userGrowthComparison,
    topCoaches,
    recentUsers,
    platformMetrics,

  ] = await Promise.all(promises);

  return {
    stats: [
      // // ---------------- USERS ----------------
      {
        key: "totalCoaches",
        title: DASHBOARD_KEYS.totalCoaches.title,
        totalCoaches: stats.totalCoaches || 0,
        coachesThisMonth: stats.coachesThisMonth || "0 this month",
      },
      {
        key: "totalAthletes",
        title: DASHBOARD_KEYS.totalAthletes.title,
        totalAthletes: stats.totalAthletes || 0,
        athletesThisMonth: stats.athletesThisMonth || "0 this month",
      },
      // // ---------------- REVENUE ----------------
      {
        key: "totalSessions",
        title: DASHBOARD_KEYS.totalSessions.title,
        totalSessions: sessions.totalBookings || 0,
        sessionsThisMonth: sessions.thisWeekBookings || "0 this month",
      },
      {
        key: "platformRevenue",
        title: DASHBOARD_KEYS.platformRevenue.title,
        totalRevenue: sessions.platformRevenue || 0,
        revenueThisMonth: sessions.revenueGrowth || "0 vs last month",
      },
      {
        key: "averagePlatformRating",
        title: DASHBOARD_KEYS.averagePlatformRating.title,
        averagePlatformRating: ratingStats.averageRating || 0,
      },
      {
        key: "totalServices",
        title: DASHBOARD_KEYS.totalServices.title,
        totalServices: servicesCount || 0,
      },
      {
        key: "totalServicesBooked",
        title: DASHBOARD_KEYS.totalServicesBooked.title,
        totalServicesBooked: servicesBookedCount || 0,
      },
      {
        key: "openSupportTickets",
        title: DASHBOARD_KEYS.openSupportTickets?.title,
        openSupportTickets: openSupportTickets || 0,
      },
    ].filter(Boolean),
    PlatFormRevenueOverTime: PlatFormRevenueOverTime || [],
    bookingStatusCounts: bookingStatusCounts || {},
    userDamographics: userDamographics || {},
    userGrowthComparison: userGrowthComparison || {},
    topCoaches: topCoaches || [],
    recentUsers: recentUsers || [],
    platformMetrics: platformMetrics || {},
  };
};

const getRevenueOverTimeService = async () => {
  const rows = await dashboardRepo.getMonthlyRevenueComparison();
  return buildRevenueOverTime(rows);
};
const getMonthlyUserGrowthComparison = async () => {
  const rows = await dashboardRepo.getMonthlyUserGrowthComparison();
  return buildUserGrowthOverTime(rows);
}

module.exports = {
  getDashboard,
};
