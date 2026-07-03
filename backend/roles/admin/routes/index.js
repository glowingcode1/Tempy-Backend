const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const router = express.Router();
router.use("/", require("../../../routes/index"));
router.use(auth, roleMiddleware(["admin"]));
router.use("/settings", require("../settings/adminSettingsRoutes"));
router.use("/users", require("../usersManagement/usersRoutes"));

router.use("/faqs", require("../faqs/faqsRoutes"));
router.use("/support", require("../support/supportRoutes"));
router.use(
  "/credentials",
  require("../onboardingAndFilters/credentials/credentialsRoutes"),
);
router.use(
  "/specialities",
  require("../onboardingAndFilters/specialities/specialitiesRoutes"),
);
router.use(
  "/coaching-style",
  require("../onboardingAndFilters/coachingStyle/coachingStyleRoutes"),
);
router.use(
  "/price-ranges",
  require("../onboardingAndFilters/priceRange/priceRangeRoutes"),
);
//timezones
router.use(
  "/timezones",
  require("../onboardingAndFilters/timezones/timezonesRoutes"),
);
//distancesRange
router.use(
  "/distances-ranges",
  require("../onboardingAndFilters/distancesRange/distancesRangeRoutes"),
);
//federations
router.use(
  "/bodybuilding-federations",
  require("../onboardingAndFilters/bodyBuilding/federations/federationsRoutes"),
);
//divisions
router.use(
  "/bodybuilding-divisions",
  require("../onboardingAndFilters/bodyBuilding/divisions/divisionsRoutes"),
);
router.use(
  "/powerlifting-federations",
  require("../onboardingAndFilters/powerLifting/federations/federationsRoutes"),
);
router.use(
  "/powerlifting-divisions",
  require("../onboardingAndFilters/powerLifting/divisions/divisionsRoutes"),
);
router.use("/help-center", require("../helpCenter/helpCenterRoutes"));
router.use("/dashboard", require("../dashboard/dashboardsRoutes"));
router.use("/dashboard-stats", require("../dashboardStats/dashboardsRoutes"));
router.use(
  "/review-templates",
  require("../reviewTemplate/reviewTemplateRoutes"),
);
router.use(
  "/athlete-types",
  require("../onboardingAndFilters/athleteTypes/athleteTypesRoutes"),
);
router.use(
  "/experience-levels",
  require("../onboardingAndFilters/experienceLevel/experienceLevelRoutes"),
);
router.use(
  "/placeholder-profile",
  require("../placeholder/placeholderProfileRoutes"),
);

router.use("/support", require("../support/supportRoutes"));
router.use(
  "/coach/assignments-tracking",
  require("../../coach/assignmentsTracking/assignmentsTrackingRoutes"),
);
router.use(
  "/plans-and-templates-assignments",
  require("../../coach/plansAndTemplatesAssignments/plansAndTemplatesAssignmentsRoutes"),
);
router.use("/sub-admins", require("../subAdmins/subAdminsRoutes"));
router.use("/coaches", require("../../user/suggestedCoaches/suggestedCoachesRoutes"));


router.use("/clients", require("../../coach/clients/clientsRoutes"));
router.use("/athletes", require("../../coach/suggestedAthletes/suggestedAthletesRoutes"));
router.use("/tasks", require("../../coach/tasks/tasksRoutes"));
router.use("/services", require("../../coach/services/servicesRoutes"));
router.use("/bookings", require("../../user/bookings/bookingsRoutes"));
router.use(
  "/search",
  require("../../../commonModules/searchSuggestions/searchSuggestionRoutes"),
);

module.exports = router;
