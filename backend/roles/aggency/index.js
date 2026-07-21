const express = require("express");

const router = express.Router();

router.use("/bids", require("./bid/bidRoutes"));
router.use("/booking", require("../careHome/booking/bookingRoutes"));
router.use("/job", require("../careHome/job/jobRoutes"));
router.use("/staff", require("./staff/staffRoutes"));
router.use("/branches", require("./branches/branchesRoutes"));
router.use("/availability", require("./availability/availabilityRoutes"));
router.use("/job", require("../careHome/job/jobRoutes"));
router.use("/job-roles", require("../admin/jobRole/jobRoleRoutes"));

module.exports = router;
