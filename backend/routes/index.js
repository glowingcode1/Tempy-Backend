const express = require("express");
const router = express.Router();
router.use("/auth", require("./authRoutes"));
router.use("/upload", require("./uploadRoutes"));
router.use("/upload/aws", require("./uploadAWSRoutes"));
router.use("/upload/azure", require("./uploadAzureBlobRoutes"));
router.use("/settings", require("../roles/admin/settings/adminSettingsRoutes"));
router.use("/communications", require("./communicationRoutes"));
router.use("/notifications", require("./notificationsRoutes"));
router.use("/support", require("./supportRoutes"));
router.use("/contact-us", require("./contactUsRoutes"));
router.use("/languages", require("./languageRoutes"));
router.use("/util", require("./dbRoutes"));
// router.use("/reviews", require("../commonModules/reviews/reviewRoutes"));
router.use("/engagement", require("../commonModules/appEngagement/engagementEventsRoutes"));

router.use("/dashboard", require("../roles/admin/dashboard/dashboardsRoutes"));

//locations
router.use("/locations", require("../shared/locations/routes"));
        


//users
router.use("/users", require("../roles/admin/usersManagement/usersRoutes"));

//leads
// router.use("/engagement", require("../commonModules/appEngagement/engagementEventsRoutes"));

//notification preferences
router.use("/notification-preferences", require("./notificationPreferencesRoutes"));
// router.use("/send-reminder", require("./sendRemindersRoutes"));
// router.use(
//   "/placeholder-profile",
//   require("../roles/admin/placeholder/placeholderProfileRoutes"),
// );
// router.use(
//   "/share",
//   require("../commonModules/share/shareRoutes"),
// );

// router.use("/stripe", require("../commonModules/stripeModule/routes/stripeAccountRoutes"));


module.exports = router;
