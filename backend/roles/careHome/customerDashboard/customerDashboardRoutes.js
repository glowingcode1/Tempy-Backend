const express = require("express");
const { getCustomerDashboard } = require("./customerDashboardController");
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Dashboard routes
const apiRateLimiter = createRateLimiter("Dashboard");

// Get all dashboards with pagination
router.get(
  "/",
  roleMiddleware(["careHome", "user", "hospital", "localAuthority", "admin"]),
  apiRateLimiter,
  getCustomerDashboard,
);

module.exports = router;
