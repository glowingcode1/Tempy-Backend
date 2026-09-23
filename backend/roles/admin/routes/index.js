const express = require("express");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");
const router = express.Router();
router.use("/", require("../../../routes/index"));
router.use(auth, roleMiddleware(["admin"]));
router.use("/settings", require("../settings/adminSettingsRoutes"));
router.use("/users", require("../usersManagement/usersRoutes"));

router.use("/faqs", require("../faqs/faqsRoutes"));
router.use("/support", require("../support/supportRoutes"));
router.use("/job-roles", require("../jobRole/jobRoleRoutes"));
router.use("/job", require("../../careHome/job/jobRoutes"));
router.use("/bids", require("../../aggency/bid/bidRoutes"));
router.use("/staff", require("../../aggency/staff/staffRoutes"));
router.use("/address", require("../../nurse/address/addressRoutes"));
router.use("/branches", require("../../aggency/branches/branchesRoutes"));
router.use("/booking", require("../../careHome/booking/bookingRoutes"));
router.use("/agreed-rates", require("../../careHome/agreedRates/agreedRatesRoutes"));
router.use("/contracts", require("../../../commonModules/supplierRelationship/supplierRelationshipRoutes"));
router.use("/permanent-hires", require("../../../commonModules/permanentHire/permanentHireRoutes"));

module.exports = router;
