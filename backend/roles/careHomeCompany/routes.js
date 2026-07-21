const express = require("express");

const router = express.Router();

router.use("/bids", require("../aggency/bid/bidRoutes"));
router.use("/branches", require("../aggency/branches/branchesRoutes"));
router.use(
  "/availability",
  require("../aggency/availability/availabilityRoutes"),
);

module.exports = router;
