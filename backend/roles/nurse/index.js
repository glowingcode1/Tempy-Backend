const auth = require("@middlewares/authMiddleware");
const roleMiddleware = require("@middlewares/roleMiddleware");
const express = require("express");

const router = express.Router();

router.use(auth, roleMiddleware(["nurse"]));

router.use("/address", require("./address/addressRoutes"));
router.use("/bids", require("../aggency/bid/bidRoutes"));
router.use("/booking", require("../careHome/booking/bookingRoutes"));
router.use("/job", require("../careHome/job/jobRoutes"));
router.use("/staff", require("../aggency/staff/staffRoutes"));
router.use("/branches", require("../aggency/branches/branchesRoutes"));
router.use(
  "/availability",
  require("../aggency/availability/availabilityRoutes"),
);
router.use("/job-roles", require("../admin/jobRole/jobRoleRoutes"));

module.exports = router;
