const express = require("express");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const { searchPublicStaff } = require("./publicStaffController");

const router = express.Router();

// Public endpoint: deliberately has no auth middleware.
router.post("/search", createRateLimiter("publicStaffSearch", 15, 100), searchPublicStaff);

module.exports = router;
