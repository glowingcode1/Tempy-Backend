const express = require("express");

const router = express.Router();

router.use("/bids", require("./bid/bidRoutes"));
router.use("/staff", require("./staff/staffRoutes"));
router.use("/branches", require("./branches/branchesRoutes"));
router.use("/availability", require("./availability/availabilityRoutes"));

module.exports = router;
