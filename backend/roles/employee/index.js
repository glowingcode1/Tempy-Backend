const express = require("express");

const router = express.Router();






router.use("/address", require("./address/addressRoutes"));
router.use("/bids", require("../aggency/bid/bidRoutes"));


module.exports = router;