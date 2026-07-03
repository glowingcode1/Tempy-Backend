const express = require("express");
const router = express.Router();

//common routes
router.use("/", require("./index"));
router.use("/conversations", require("../commonModules/chatModule/routes/messageRoutes"));
//coach routes
router.use("/coach", require("../roles/coach/routes/index"));
//athlete routes
router.use("/athlete", require("../roles/user/routes/index"));
router.use("/general", require("../commonModules/general/generalRoutes"));

module.exports = router;
          