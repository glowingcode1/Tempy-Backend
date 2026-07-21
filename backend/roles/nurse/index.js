const express = require("express");

const router = express.Router();






router.use("/address", require("./address/addressRoutes"));
router.use("/bids", require("../aggency/bid/bidRoutes"));
router.use("/booking", require("../careHome/booking/bookingRoutes"));


module.exports = router;