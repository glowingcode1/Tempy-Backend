const express = require("express");
const moment = require("moment");
const {
  createJobRole,
  getJobRole,
  updateJobRole,
  deleteJobRole,
  getJobRoleDetails,
} = require("./jobRoleController"); // Assuming you have a separate controller for promo codes
const createRateLimiter = require("../../../helperUtils/rateLimiter");
const auth = require("../../../middlewares/authMiddleware");
const roleMiddleware = require("../../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Promo Codes
const JobRoleRateLimiter = createRateLimiter("JobRole");

// Routes for JobRole Management
// Create a new JobRole
router.post("/", roleMiddleware(["admin"]), JobRoleRateLimiter, createJobRole);

// Get all JobRole with pagination
router.get("/", roleMiddleware(["admin","agency","employee"]), JobRoleRateLimiter, getJobRole);
// Get a specific JobRole by ID
router.get("/:id", roleMiddleware(["admin","agency","employee"]), JobRoleRateLimiter, getJobRoleDetails);


// Update an existing JobRole
router.put("/:id", roleMiddleware(["admin"]), updateJobRole);

// Delete a JobRole
router.delete("/:id", roleMiddleware(["admin"]), deleteJobRole);

module.exports = router;
