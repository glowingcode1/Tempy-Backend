// const auth = require("@middlewares/authMiddleware");
// const roleMiddleware = require("@middlewares/roleMiddleware");
const express = require("express");

const router = express.Router();

// router.use(auth, roleMiddleware(["homeCareCompany"]));

router.use("/bids", require("../aggency/bid/bidRoutes"));
router.use("/job", require("../careHome/job/jobRoutes"));
router.use("/branches", require("../aggency/branches/branchesRoutes"));
router.use("/booking", require("../careHome/booking/bookingRoutes"));
router.use("/staff", require("../aggency/staff/staffRoutes"));
router.use("/job-roles", require("../admin/jobRole/jobRoleRoutes"));
router.use("/home", require("./employeeHome/employeeHomeRoutes"));
router.use(
  "/availability",
  require("../aggency/availability/availabilityRoutes"),
);
router.use(
  "/dashboard",
  require("../aggency/supplierDashboard/supplierDashboardRoutes"),
);
router.use("/address", require("../nurse/address/addressRoutes"));
router.use("/agreed-rates", require("../careHome/agreedRates/agreedRatesRoutes"));
router.use("/contracts", require("../../commonModules/supplierRelationship/supplierRelationshipRoutes"));

router.use("/sidebar", require("../../commonModules/sidebar/sidebarRoutes"));

module.exports = router;
