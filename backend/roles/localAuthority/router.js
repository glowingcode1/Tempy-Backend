const express = require("express");

const router = express.Router();


router.use("/bids", require("../aggency/bid/bidRoutes"));
router.use("/job", require("../careHome/job/jobRoutes"));
router.use("/branches", require("../aggency/branches/branchesRoutes"));
router.use("/booking", require("../careHome/booking/bookingRoutes"));





module.exports = router;