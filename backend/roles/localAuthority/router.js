// const auth = require("@middlewares/authMiddleware");
// const roleMiddleware = require("@middlewares/roleMiddleware");
const express = require("express");

const router = express.Router();

// router.use(auth, roleMiddleware(["localAuthority"]));

router.use("/bids", require("../aggency/bid/bidRoutes"));
router.use("/job", require("../careHome/job/jobRoutes"));
router.use("/branches", require("../aggency/branches/branchesRoutes"));
router.use("/booking", require("../careHome/booking/bookingRoutes"));
router.use("/staff", require("../aggency/staff/staffRoutes"));
router.use("/home", require("./customerHome/customerHomeRoutes"));
router.use(
  "/dashboard",
  require("../careHome/customerDashboard/customerDashboardRoutes"),
);
router.use("/address", require("../nurse/address/addressRoutes"));
router.use("/contracts", require("../../commonModules/supplierRelationship/supplierRelationshipRoutes"));

module.exports = router;
