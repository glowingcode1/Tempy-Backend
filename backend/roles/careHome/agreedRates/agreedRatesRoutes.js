const express = require("express");
const {
  createAgreedRate,
  getAgreedRates,
  updateAgreedRate,
  deleteAgreedRate,
} = require("./agreedRatesController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const {
  getUsersByType,
} = require("../../admin/usersManagement/usersController");
// const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const JobRateLimiter = createRateLimiter("Jobs");

// Routes for Job Management
// Create a new Job
router.post(
  "/",
  // roleMiddleware(["admin", "careHome", "localAuthority"]),
  JobRateLimiter,
  createAgreedRate,
);

// Get all Jobs with pagination
router.get(
  "/",
  // roleMiddleware(["admin", "careHome", "agency", "nurse", "localAuthority"]),
  JobRateLimiter,
  getAgreedRates,
);

router.get("/users", getUsersByType);

// Update an existing Job
router.put(
  "/:id",
  // roleMiddleware(["admin", "careHome", "localAuthority"]),
  updateAgreedRate,
);

// Delete a Job
router.delete(
  "/:id",
  // roleMiddleware(["admin", "careHome", "localAuthority"]),
  deleteAgreedRate,
);

module.exports = router;
