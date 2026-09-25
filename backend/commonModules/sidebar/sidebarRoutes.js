const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const { getCounts, markSeen } = require("./sidebarController");

const router = express.Router();

router.use(auth);

// Which badges apply is decided by the account's type, so every role shares
// these routes; an admin viewing an account gets that account's counts.
router.get("/counts", getCounts);
router.post("/seen", markSeen);

module.exports = router;
