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
router.use(
  "/availability",
  require("../aggency/availability/availabilityRoutes"),
);
router.use(
  "/dashboard",
  require("../aggency/supplierDashboard/supplierDashboardRoutes"),
);

module.exports = router;
