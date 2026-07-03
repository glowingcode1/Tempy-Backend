const express = require("express");

const router = express.Router();






router.use("/job", require("./careHome/job/jobRoutes"));
router.use("/bids", require("./aggency/index"));




router.use("/care-home", require("./careHome/routes"));
router.use("/agency", require("./aggency/index"));
router.use("/employee", require("./employee/index"));




module.exports = router;