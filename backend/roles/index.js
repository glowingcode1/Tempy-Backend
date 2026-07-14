const express = require("express");

const router = express.Router();






router.use("/job", require("./careHome/job/jobRoutes"));
router.use("/booking", require("./careHome/booking/bookingRoutes"));
router.use("/bids", require("./aggency/index"));




router.use("/care-home", require("./careHome/routes"));
router.use("/home-care-company", require("./careHomeCompany/routes"));
router.use("/agency", require("./aggency/index"));
router.use("/nurse", require("./employee/index"));




module.exports = router;