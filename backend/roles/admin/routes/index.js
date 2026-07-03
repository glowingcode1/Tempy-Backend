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



module.exports = router;
