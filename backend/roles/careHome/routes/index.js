const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const router = express.Router();
router.use(auth, roleMiddleware(["careHome"]));

router.use("/job", require("../job/jobRoutes"));
router.use("/staff", require("../../aggency/staff/staffRoutes"));
module.exports = router;