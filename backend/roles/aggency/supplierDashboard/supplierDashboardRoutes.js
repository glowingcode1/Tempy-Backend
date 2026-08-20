const express = require("express");
const { getSupplierDashboard } = require("./supplierDashboardController");
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
  roleMiddleware(["agency", "nurse", "homeCareCompany", "admin"]),
  apiRateLimiter,
  getSupplierDashboard,
);

module.exports = router;
