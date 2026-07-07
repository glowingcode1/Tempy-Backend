const express = require("express");

const router = express.Router();


router.use("/bids", require("./bid/bidRoutes"));
router.use("/staff", require("./staff/staffRoutes"));

module.exports = router;   