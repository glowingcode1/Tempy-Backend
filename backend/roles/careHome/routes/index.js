const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const router = express.Router();
router.use(auth, roleMiddleware(["careHome"]));

router.use("/job", require("../job/jobRoutes"));
router.use("/staff", require("../../aggency/staff/staffRoutes"));
router.use("/booking", require("../booking/bookingRoutes"));
router.use("/branches", require("../../aggency/branches/branchesRoutes"));
module.exports = router;