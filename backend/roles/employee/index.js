const express = require("express");

const router = express.Router();






router.use("/address", require("./address/addressRoutes"));


module.exports = router;