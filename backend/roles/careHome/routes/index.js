const express = require("express");
// const auth = require("../../../middlewares/authMiddleware");
// const roleMiddleware = require("../../../middlewares/roleMiddleware");
const router = express.Router();
// router.use(auth, roleMiddleware(["careHome"]));

router.use("/job", require("../job/jobRoutes"));
router.use("/bid", require("../../aggency/bid/bidRoutes"));
router.use("/staff", require("../../aggency/staff/staffRoutes"));
router.use("/booking", require("../booking/bookingRoutes"));
router.use("/address", require("../../nurse/address/addressRoutes"));
router.use("/branches", require("../../aggency/branches/branchesRoutes"));
router.use(
  "/availability",
  require("../../aggency/availability/availabilityRoutes"),
);
router.use("/agreed-rates", require("../agreedRates/agreedRatesRoutes"));
module.exports = router;
