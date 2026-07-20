const express = require("express");

const router = express.Router();


router.use("/bids", require("../aggency/bid/bidRoutes"));





module.exports = router;