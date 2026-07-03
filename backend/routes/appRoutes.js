  const express = require("express");
const router = express.Router();

//common routes
router.use("/", require("./index"));
router.use("/conversations", require("../commonModules/chatModule/routes/messageRoutes"));
//coach routes
router.use("/coach", require("../roles/coach/routes/index"));
//athlete routes
router.use("/athlete", require("../roles/user/routes/index"));

//calendar routes
router.use("/google-calendar", require("../commonModules/googleCalendar/routes/googleCalendar.routes"))

module.exports = router;