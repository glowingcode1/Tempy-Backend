const express = require("express");

const router = express.Router();


router.use("/bids", require("./bid/bidRoutes"));

module.exports = router;